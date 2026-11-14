#!/usr/bin/env python3
"""Evaluate article-level vs chunk-level (and optional hybrid) retrieval.

Reuses ~/mariadb-vector-wikipedia-rag/evaluate.py directly by inserting the
organizers' repo into sys.path and monkeypatching common.search, without copying
or modifying any file in their repository.
"""

import argparse
import contextlib
import importlib
import io
import json
import os
import statistics
import sys
import types
import urllib.error
import urllib.request

RRF_K = 60
CHUNK_TOP_N = 50

CHUNK_SQL = """
SELECT a.lang, a.page_id, a.wikidata_id, a.title, a.url, g.d AS distance
FROM (
  SELECT c.lang, c.page_id, MIN(c.d) AS d
  FROM (
    SELECT lang, page_id, chunk_no,
           VEC_DISTANCE_COSINE(embedding, VEC_FromText(?)) AS d
    FROM chunk_vector
    {where}
    ORDER BY d
    LIMIT 50
  ) AS c
  GROUP BY c.lang, c.page_id
  ORDER BY d
  LIMIT ?
) AS g
JOIN article a USING (lang, page_id)
ORDER BY g.d"""


def install_requests_shim_if_missing() -> None:
    """Provide a stdlib-urllib shim for requests if not installed in this venv."""
    try:
        import requests  # noqa: F401
        return
    except ImportError:
        pass

    class _Response:
        def __init__(self, status_code: int, text: str):
            self.status_code = status_code
            self.text = text

        def json(self):
            return json.loads(self.text)

    def _post(url: str, timeout: int = 600, **kwargs):
        payload = kwargs.get("json")
        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return _Response(resp.status, resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            return _Response(exc.code, exc.read().decode("utf-8", errors="replace"))

    shim = types.ModuleType("requests")
    shim.post = _post
    sys.modules["requests"] = shim


def make_chunk_search(common_mod):
    """Build a search() replacement using chunk_vector top-50 grouped by article."""

    def chunk_search(cur, question, mode="vector", lang=None, category=None, limit=10, vector=None):
        if category is not None:
            raise NotImplementedError("category filter not supported in chunk_search")
        if mode != "vector":
            raise ValueError(f"Unsupported mode {mode!r} in chunk_search")
        if vector is None:
            [vector], _ = common_mod.embed([question])
        sql = CHUNK_SQL.format(where="WHERE lang = ?" if lang else "")
        params = [common_mod.vector_text(vector)] + ([lang] if lang else []) + [limit]
        cur.execute(sql, params)
        columns = [d[0] for d in cur.description]
        return sql.strip(), [dict(zip(columns, row)) for row in cur.fetchall()]

    return chunk_search


def make_partial_chunk_search(common_mod):
    """Rank by chunk_vector where a page has chunks, else fall back to article_vector."""
    cv_sql = (
        "SELECT c.lang, c.page_id, MIN(c.d) AS d "
        "FROM ("
        "  SELECT lang, page_id, chunk_no, "
        "         VEC_DISTANCE_COSINE(embedding, VEC_FromText(?)) AS d "
        "  FROM chunk_vector "
        "  {where} "
        "  ORDER BY d "
        "  LIMIT 50"
        ") AS c "
        "GROUP BY c.lang, c.page_id"
    )
    av_sql = (
        "SELECT lang, page_id, VEC_DISTANCE_COSINE(embedding, VEC_FromText(?)) AS d "
        "FROM article_vector "
        "{where} "
        "ORDER BY d "
        "LIMIT 50"
    )

    def partial_search(cur, question, mode="vector", lang=None, category=None, limit=10, vector=None):
        if category is not None:
            raise NotImplementedError("category filter not supported in partial_search")
        if mode != "vector":
            raise ValueError(f"Unsupported mode {mode!r} in partial_search")
        if vector is None:
            [vector], _ = common_mod.embed([question])

        vtxt = common_mod.vector_text(vector)
        where = "WHERE lang = ?" if lang else ""
        params = [vtxt] + ([lang] if lang else [])

        cur.execute(cv_sql.format(where=where), params)
        combined = {(l, p): float(d) for l, p, d in cur.fetchall()}

        cur.execute(av_sql.format(where=where), params)
        art_candidates = [(l, p, float(d)) for l, p, d in cur.fetchall()]

        if art_candidates:
            placeholders = ", ".join(["(?, ?)"] * len(art_candidates))
            flat_keys = [val for l, p, _ in art_candidates for val in (l, p)]
            cur.execute(
                f"SELECT DISTINCT lang, page_id FROM chunk_vector "
                f"WHERE (lang, page_id) IN ({placeholders})",
                flat_keys,
            )
            has_chunks = {(l, p) for l, p in cur.fetchall()}
            for l, p, d in art_candidates:
                if (l, p) not in has_chunks and (l, p) not in combined:
                    combined[(l, p)] = d

        top_articles = sorted(combined.items(), key=lambda kv: kv[1])[:limit]
        if not top_articles:
            return "PARTIAL_CHUNK_FALLBACK", []

        placeholders = ", ".join(["(?, ?)"] * len(top_articles))
        flat_keys = [val for (l, p), _ in top_articles for val in (l, p)]
        cur.execute(
            f"SELECT lang, page_id, wikidata_id, title, url "
            f"FROM article WHERE (lang, page_id) IN ({placeholders})",
            flat_keys,
        )
        meta = {(l, p): (wid, title, url) for l, p, wid, title, url in cur.fetchall()}
        rows = []
        for (l, p), dist in top_articles:
            wid, title, url = meta[(l, p)]
            rows.append(
                {
                    "lang": l,
                    "page_id": p,
                    "wikidata_id": wid,
                    "title": title,
                    "url": url,
                    "distance": dist,
                }
            )
        return "PARTIAL_CHUNK_FALLBACK", rows

    return partial_search


def make_hybrid_search(common_mod):
    """Build a search() replacement fusing vector top-50 and FULLTEXT top-50 via RRF."""
    vec_sql = (
        "SELECT lang, page_id, chunk_no "
        "FROM chunk_vector "
        "{where} "
        "ORDER BY VEC_DISTANCE_COSINE(embedding, VEC_FromText(?)) "
        "LIMIT 50"
    )
    ft_sql = (
        "SELECT lang, page_id, chunk_no, "
        "       MATCH(text) AGAINST(? IN NATURAL LANGUAGE MODE) AS score "
        "FROM chunk "
        "WHERE MATCH(text) AGAINST(? IN NATURAL LANGUAGE MODE) {and_lang} "
        "ORDER BY score DESC "
        "LIMIT 50"
    )

    def hybrid_search(cur, question, mode="vector", lang=None, category=None, limit=10, vector=None):
        if category is not None:
            raise NotImplementedError("category filter not supported in hybrid_search")
        if vector is None:
            [vector], _ = common_mod.embed([question])

        v_sql = vec_sql.format(where="WHERE lang = ?" if lang else "")
        v_params = [common_mod.vector_text(vector)] + ([lang] if lang else [])
        cur.execute(v_sql, v_params)
        vec_rows = cur.fetchall()

        f_sql = ft_sql.format(and_lang="AND lang = ?" if lang else "")
        f_params = [question, question] + ([lang] if lang else [])
        cur.execute(f_sql, f_params)
        ft_rows = cur.fetchall()

        rrf_scores: dict[tuple[str, int, int], float] = {}
        for rank, (r_lang, r_pid, r_cno) in enumerate(vec_rows, 1):
            key = (r_lang, r_pid, r_cno)
            rrf_scores[key] = rrf_scores.get(key, 0.0) + 1.0 / (RRF_K + rank)
        for rank, (r_lang, r_pid, r_cno, _) in enumerate(ft_rows, 1):
            key = (r_lang, r_pid, r_cno)
            rrf_scores[key] = rrf_scores.get(key, 0.0) + 1.0 / (RRF_K + rank)

        article_scores: dict[tuple[str, int], float] = {}
        for (r_lang, r_pid, _), score in rrf_scores.items():
            akey = (r_lang, r_pid)
            if akey not in article_scores or score > article_scores[akey]:
                article_scores[akey] = score

        top_articles = sorted(article_scores.items(), key=lambda kv: kv[1], reverse=True)[:limit]
        if not top_articles:
            return "HYBRID_RRF", []

        placeholders = ", ".join(["(?, ?)"] * len(top_articles))
        flat_keys = [val for (l, p), _ in top_articles for val in (l, p)]
        cur.execute(
            f"SELECT lang, page_id, wikidata_id, title, url "
            f"FROM article WHERE (lang, page_id) IN ({placeholders})",
            flat_keys,
        )
        meta = {(l, p): (wid, title, url) for l, p, wid, title, url in cur.fetchall()}
        rows = []
        for (l, p), rrf_score in top_articles:
            wid, title, url = meta[(l, p)]
            rows.append(
                {
                    "lang": l,
                    "page_id": p,
                    "wikidata_id": wid,
                    "title": title,
                    "url": url,
                    "score": rrf_score,
                }
            )
        return f"{v_sql} + {f_sql}", rows

    return hybrid_search


def ensure_chunk_fulltext(common_mod) -> None:
    """Add FULLTEXT KEY (text) on wikirag.chunk if not already present."""
    con = common_mod.connect()
    cur = con.cursor()
    try:
        cur.execute("SHOW INDEX FROM chunk WHERE Index_type = 'FULLTEXT'")
        if not cur.fetchall():
            print("Adding FULLTEXT KEY ft_text (text) on wikirag.chunk ...", flush=True)
            cur.execute("ALTER TABLE chunk ADD FULLTEXT KEY ft_text (text)")
            con.commit()
    finally:
        cur.close()
        con.close()


def run_eval_pass(common_mod, repo_dir: str, questions_path: str, runs: int, search_fn):
    """Execute organizers' evaluate.py with common.search set to search_fn."""
    common_mod.search = search_fn
    saved_argv = sys.argv[:]
    buf = io.StringIO()
    try:
        sys.argv = [
            "evaluate.py",
            "--runs",
            str(runs),
            "--modes",
            "vector",
            "--questions",
            questions_path,
        ]
        with contextlib.redirect_stdout(buf):
            if "evaluate" in sys.modules:
                eval_mod = importlib.reload(sys.modules["evaluate"])
            else:
                eval_mod = importlib.import_module("evaluate")
        questions = [dict(q) for q in eval_mod.questions]
        sql_ms = list(eval_mod.sql_ms)
        embed_ms = list(eval_mod.embed_ms)
    finally:
        sys.argv = saved_argv
    return questions, sql_ms, embed_ms, buf.getvalue()


def compute_metrics(questions: list[dict], sql_ms: list[float]) -> dict:
    """Compute hit@1, hit@5, hit@10, MRR, and median SQL query ms from evaluate.py ranks."""
    n = len(questions)
    ranks = [q["rank"] for q in questions]
    h1 = sum(1 for r in ranks if r and r <= 1)
    h5 = sum(1 for r in ranks if r and r <= 5)
    h10 = sum(1 for r in ranks if r and r <= 10)
    mrr = sum(1 / r for r in ranks if r) / n
    return {
        "n": n,
        "h1": h1,
        "h5": h5,
        "h10": h10,
        "hit1_pct": h1 / n,
        "hit5_pct": h5 / n,
        "hit10_pct": h10 / n,
        "mrr": mrr,
        "median_ms": statistics.median(sql_ms),
        "max_ms": max(sql_ms),
    }


def format_rank(rank: int | None) -> str:
    return str(rank) if rank is not None else ">10"


def format_diff_section(title: str, base_qs: list[dict], new_qs: list[dict], k: int) -> list[str]:
    """List questions whose hit@k status changed between baseline and new method."""
    lines = [f"### {title} (top-{k})"]
    miss_to_hit = []
    hit_to_miss = []
    for bq, nq in zip(base_qs, new_qs):
        b_hit = bool(bq["rank"] and bq["rank"] <= k)
        n_hit = bool(nq["rank"] and nq["rank"] <= k)
        if not b_hit and n_hit:
            miss_to_hit.append((bq, nq))
        elif b_hit and not n_hit:
            hit_to_miss.append((bq, nq))

    lines.append(f"- **miss → hit ({len(miss_to_hit)}):**")
    if miss_to_hit:
        for bq, nq in miss_to_hit:
            lines.append(
                f"  - [{nq['lang']}] {nq['question']} → `{nq['expected_fi_title']}` "
                f"(rank {format_rank(bq['rank'])} → {format_rank(nq['rank'])}, top: {nq['top']})"
            )
    else:
        lines.append("  - *(none)*")

    lines.append(f"- **hit → miss ({len(hit_to_miss)}):**")
    if hit_to_miss:
        for bq, nq in hit_to_miss:
            lines.append(
                f"  - [{nq['lang']}] {nq['question']} → `{nq['expected_fi_title']}` "
                f"(rank {format_rank(bq['rank'])} → {format_rank(nq['rank'])}, top: {nq['top']})"
            )
    else:
        lines.append("  - *(none)*")
    return lines


def get_coverage(common_mod) -> tuple[int, int, int, int]:
    """Return (embedded_chunks, total_chunks, chunked_articles, total_articles)."""
    con = common_mod.connect()
    cur = con.cursor()
    try:
        cur.execute(
            "SELECT "
            "(SELECT COUNT(*) FROM chunk_vector), "
            "(SELECT COUNT(*) FROM chunk), "
            "(SELECT COUNT(*) FROM (SELECT DISTINCT lang, page_id FROM chunk_vector) t), "
            "(SELECT COUNT(*) FROM article)"
        )
        return tuple(int(x) for x in cur.fetchone())
    finally:
        cur.close()
        con.close()


def parse_args():
    parser = argparse.ArgumentParser(description="Evaluate article vs chunk retrieval.")
    parser.add_argument(
        "--repo-dir",
        default=os.path.expanduser("~/mariadb-vector-wikipedia-rag"),
        help="Path to organizers' mariadb-vector-wikipedia-rag repo",
    )
    parser.add_argument("--runs", type=int, default=3, help="Repeat each search N times for timing")
    parser.add_argument(
        "--partial",
        action="store_true",
        help="Partial eval: rank by chunk_vector where available, else article_vector",
    )
    parser.add_argument("--hybrid", action="store_true", help="Also evaluate chunk FULLTEXT+vector RRF")
    parser.add_argument(
        "--output",
        default=os.path.expanduser("~/wikimemory/eval_chunks.md"),
        help="Path to write Markdown report",
    )
    parser.add_argument("--verbose", action="store_true", help="Print raw evaluate.py per-method tables")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo_dir = os.path.abspath(os.path.expanduser(args.repo_dir))
    questions_path = os.path.join(repo_dir, "data", "test-questions.tsv")
    if not os.path.isfile(questions_path):
        print(f"ERROR: test-questions.tsv not found at {questions_path}", file=sys.stderr)
        return 1

    install_requests_shim_if_missing()
    sys.path.insert(0, repo_dir)
    import common  # noqa: E402

    orig_search = common.search
    emb_chunks, tot_chunks, chunked_arts, tot_arts = get_coverage(common)

    results = []
    raw_outputs = []

    base_qs, base_sql_ms, _, base_out = run_eval_pass(
        common, repo_dir, questions_path, args.runs, orig_search
    )
    results.append(("article (evaluate.py)", base_qs, compute_metrics(base_qs, base_sql_ms)))
    raw_outputs.append(("article (evaluate.py)", base_out))

    chunk_label = "chunk (partial)" if args.partial else "chunk"
    chunk_fn = make_partial_chunk_search(common) if args.partial else make_chunk_search(common)
    chunk_qs, chunk_sql_ms, _, chunk_out = run_eval_pass(
        common, repo_dir, questions_path, args.runs, chunk_fn
    )
    results.append((chunk_label, chunk_qs, compute_metrics(chunk_qs, chunk_sql_ms)))
    raw_outputs.append((chunk_label, chunk_out))

    hybrid_qs = None
    if args.hybrid:
        ensure_chunk_fulltext(common)
        hybrid_qs, hybrid_sql_ms, _, hybrid_out = run_eval_pass(
            common, repo_dir, questions_path, args.runs, make_hybrid_search(common)
        )
        hybrid_label = "hybrid (partial)" if args.partial else "hybrid"
        results.append((hybrid_label, hybrid_qs, compute_metrics(hybrid_qs, hybrid_sql_ms)))
        raw_outputs.append((hybrid_label, hybrid_out))

    header = (
        f"# Chunk vs Article Retrieval Evaluation (37 questions, partial: {emb_chunks}/{tot_chunks} chunks)"
        if args.partial
        else "# Chunk vs Article Retrieval Evaluation (37 questions)"
    )
    md_lines = [
        header,
        "",
        f"Coverage: `{emb_chunks}/{tot_chunks}` chunks embedded across `{chunked_arts}/{tot_arts}` articles.",
        "",
        "| method | hit@5 | hit@10 | median query ms |",
        "|---|---|---|---|",
    ]
    for label, _, m in results:
        md_lines.append(
            f"| {label} | {m['hit5_pct']:.0%} ({m['h5']}/{m['n']}) | "
            f"{m['hit10_pct']:.0%} ({m['h10']}/{m['n']}) | {m['median_ms']:.1f} |"
        )

    md_lines.extend(
        [
            "",
            "## Additional metrics (hit@1, MRR, slowest query ms)",
            "",
            "| method | hit@1 | MRR | slowest query ms |",
            "|---|---|---|---|",
        ]
    )
    for label, _, m in results:
        md_lines.append(
            f"| {label} | {m['hit1_pct']:.0%} ({m['h1']}/{m['n']}) | {m['mrr']:.2f} | {m['max_ms']:.1f} |"
        )

    md_lines.extend(["", f"## Questions that changed: article → {chunk_label}", ""])
    md_lines.extend(format_diff_section(f"{chunk_label} vs Article", base_qs, chunk_qs, 5))
    md_lines.append("")
    md_lines.extend(format_diff_section(f"{chunk_label} vs Article", base_qs, chunk_qs, 10))

    if hybrid_qs is not None:
        md_lines.extend(["", "## Questions that changed: article → hybrid", ""])
        md_lines.extend(format_diff_section("Hybrid vs Article", base_qs, hybrid_qs, 5))
        md_lines.append("")
        md_lines.extend(format_diff_section("Hybrid vs Article", base_qs, hybrid_qs, 10))

    report = "\n".join(md_lines) + "\n"
    out_dir = os.path.dirname(os.path.abspath(args.output))
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        f.write(report)

    print(report, end="")
    if args.verbose:
        for label, raw in raw_outputs:
            print(f"\n--- raw evaluate.py output ({label}) ---")
            print(raw)
    return 0


if __name__ == "__main__":
    sys.exit(main())
