#!/usr/bin/env python3
"""Way B spike measurement & Way A vs Way B comparison script.

Runs on the VPS using ~/wikimemory/.venv. Measures three query variants against
wikirag.chunk_vector_hist (current, AS OF with index, AS OF with IGNORE INDEX scan),
collects EXPLAIN/ANALYZE plans, median/p90 latency over 10 warm runs, rows returned,
and overlap@10, and compares retrieval passages side-by-side against Way A (spec 010).

Makes only 1 Ollama embedding call per question (<= 5 questions max; never bulk embeds).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import statistics
import sys
import time
from typing import Any
import urllib.request

# Allow importing read-only backend/history.py both locally and on VPS ~/wikimemory.
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_REPO_OR_HOME = (
    os.path.dirname(_SCRIPT_DIR)
    if os.path.basename(_SCRIPT_DIR) == "scripts"
    else _SCRIPT_DIR
)
if _REPO_OR_HOME not in sys.path:
    sys.path.insert(0, _REPO_OR_HOME)

from backend import history  # noqa: E402

MODEL = "bge-m3"
EXPECTED_DIGEST_PREFIX = "790764642607"
OLLAMA_OPTIONS = {"num_ctx": 8192, "num_batch": 8192}
EF_SEARCH_DEFAULT = 80
MAX_QUERY_EMBEDDINGS = 5

DEFAULT_QUESTIONS: list[tuple[str, int, str]] = [
    ("Miten talvisota päättyi?", 1256, "hero-fi"),
    ("How did the Winter War end?", 1256, "hero-en"),
    ("Who was the president of Finland from 1956 to 1982?", 1275, "demo-questions.tsv (test-questions-en)"),
]

_WIKITEXT_H2_RE = re.compile(r"^==[^\S\r\n]*([^=\r\n].*?)[^\S\r\n]*==[^\S\r\n]*$", re.MULTILINE)


def _connect():
    import mariadb

    con = mariadb.connect(
        host=os.environ.get("DB_HOST", "127.0.0.1"),
        port=int(os.environ.get("DB_PORT", 3307)),
        user=os.environ.get("DB_USER", "wikirag"),
        password=os.environ.get("DB_PASSWORD", "wikirag"),
        database=os.environ.get("DB_NAME", "wikirag"),
        autocommit=False,
    )
    return con


def _check_ollama_digest(ollama_url: str) -> str:
    url = f"{ollama_url.rstrip('/')}/api/tags"
    with urllib.request.urlopen(urllib.request.Request(url, method="GET"), timeout=15) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    for entry in data.get("models") or []:
        names = {entry.get("name"), entry.get("model")}
        if MODEL in names or f"{MODEL}:latest" in names:
            digest = str(entry.get("digest", ""))
            if not digest.startswith(EXPECTED_DIGEST_PREFIX):
                raise RuntimeError(
                    f"Ollama {MODEL} digest mismatch: got {digest[:12]}, expected {EXPECTED_DIGEST_PREFIX}"
                )
            return digest[:12]
    raise RuntimeError(f"Model {MODEL} not found in Ollama at {ollama_url}")


def _embed_query(question: str, ollama_url: str) -> list[float]:
    url = f"{ollama_url.rstrip('/')}/api/embed"
    payload = json.dumps(
        {
            "model": MODEL,
            "input": [question],
            "truncate": True,
            "options": OLLAMA_OPTIONS,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    embeddings = data.get("embeddings") or []
    if len(embeddings) != 1:
        raise RuntimeError(f"Expected 1 embedding from Ollama, got {len(embeddings)}")
    return embeddings[0]


def _percentile(sorted_vals: list[float], pct: float) -> float:
    """Linearly interpolated percentile on already-sorted values (0 <= pct <= 100)."""
    if not sorted_vals:
        return 0.0
    if len(sorted_vals) == 1:
        return sorted_vals[0]
    rank = (pct / 100.0) * (len(sorted_vals) - 1)
    lo = int(rank)
    hi = min(lo + 1, len(sorted_vals) - 1)
    frac = rank - lo
    return sorted_vals[lo] + frac * (sorted_vals[hi] - sorted_vals[lo])


def _find_table_node(obj: Any, table_name: str) -> dict[str, Any] | None:
    if isinstance(obj, dict):
        if obj.get("table_name") == table_name:
            return obj
        for val in obj.values():
            found = _find_table_node(val, table_name)
            if found is not None:
                return found
    elif isinstance(obj, list):
        for item in obj:
            found = _find_table_node(item, table_name)
            if found is not None:
                return found
    return None


def _summarize_plan(plan_json: dict[str, Any], is_analyze: bool) -> dict[str, Any]:
    t_node = _find_table_node(plan_json, "chunk_vector_hist") or {}
    qb = plan_json.get("query_block") or {}
    summary: dict[str, Any] = {
        "access_type": t_node.get("access_type"),
        "key": t_node.get("key"),
        "est_rows": t_node.get("rows"),
        "attached_condition": t_node.get("attached_condition"),
    }
    if is_analyze:
        summary["r_rows_examined"] = t_node.get("r_rows")
        summary["r_filtered_pct"] = t_node.get("r_filtered")
        summary["r_total_time_ms"] = qb.get("r_total_time_ms")
        summary["pages_accessed"] = (t_node.get("r_engine_stats") or {}).get("pages_accessed")
    return summary


def _measure_variant(
    cur: Any,
    label: str,
    sql: str,
    params: tuple[Any, ...],
    warmup: int,
    runs: int,
) -> dict[str, Any]:
    cur.execute(f"EXPLAIN FORMAT=JSON {sql}", params)
    explain_raw = cur.fetchone()[0]
    explain_json = json.loads(explain_raw)

    cur.execute(f"ANALYZE FORMAT=JSON {sql}", params)
    analyze_raw = cur.fetchone()[0]
    analyze_json = json.loads(analyze_raw)

    for _ in range(warmup):
        cur.execute(sql, params)
        cur.fetchall()

    timings_ms: list[float] = []
    last_rows: list[tuple[Any, ...]] = []
    for _ in range(runs):
        t0 = time.perf_counter()
        cur.execute(sql, params)
        last_rows = cur.fetchall()
        t1 = time.perf_counter()
        timings_ms.append((t1 - t0) * 1000.0)

    sorted_ms = sorted(timings_ms)
    return {
        "variant": label,
        "explain": _summarize_plan(explain_json, is_analyze=False),
        "analyze": _summarize_plan(analyze_json, is_analyze=True),
        "explain_raw": explain_raw,
        "analyze_raw": analyze_raw,
        "rows_returned": len(last_rows),
        "median_ms": statistics.median(sorted_ms),
        "p90_ms": _percentile(sorted_ms, 90.0),
        "min_ms": sorted_ms[0],
        "max_ms": sorted_ms[-1],
        "all_ms": [round(x, 3) for x in timings_ms],
        "results": [
            {
                "page_id": int(r[0]),
                "chunk_no": int(r[1]),
                "rev_id": int(r[2]),
                "section": r[3],
                "d": float(r[4]),
                "preview": " ".join(str(r[5]).split())[:200],
            }
            for r in last_rows
        ],
    }


def _normalize_heading(heading: str) -> str:
    raw = heading.strip()
    if "[[" in raw or "''" in raw:
        blocks = history.clean(f"== {raw} ==")
        if blocks:
            raw = " ".join(b[1] for b in blocks if b[1])
    return " ".join(raw.split()).casefold()


def _format_blocks(blocks: list[tuple[str, str]]) -> str:
    parts: list[str] = []
    for kind, text in blocks:
        val = text.strip()
        if not val:
            continue
        if kind == "h":
            parts.append(f"## {val}")
        elif kind == "li":
            parts.append(f"- {val}")
        else:
            parts.append(val)
    return "\n\n".join(parts)


def _split_wikitext_h2(wikitext: str) -> list[tuple[str, str]]:
    matches = list(_WIKITEXT_H2_RE.finditer(wikitext))
    out: list[tuple[str, str]] = []
    for idx, m in enumerate(matches):
        heading = m.group(1).strip()
        start = m.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(wikitext)
        out.append((heading, wikitext[start:end]))
    return out


def _extract_waya_section_texts(
    wikitext: str,
    target_sections: list[str | None],
) -> tuple[list[tuple[str, str]], list[str]]:
    """Extract cleaned section texts matching target_sections (mirroring spec 010 ask.py).

    Returns (extracted_pairs, missed_headings). When target_sections requests headings and none
    exist in the historical wikitext, spec 010's extract_year_context falls back to full article.
    """
    want_lead = any(s is None or not str(s).strip() for s in target_sections)
    want_headings = {
        _normalize_heading(str(s)): str(s)
        for s in target_sections
        if s is not None and str(s).strip()
    }

    matched_h2: list[tuple[str, str]] = []
    matched_norms: set[str] = set()
    for raw_heading, raw_body in _split_wikitext_h2(wikitext):
        norm = _normalize_heading(raw_heading)
        if norm in want_headings:
            matched_norms.add(norm)
            sec_clean = _format_blocks(history.clean(f"== {raw_heading} ==\n{raw_body}"))
            if sec_clean:
                matched_h2.append((raw_heading, sec_clean))

    missed_headings = [orig for norm, orig in want_headings.items() if norm not in matched_norms]

    if not matched_h2:
        full_clean = _format_blocks(history.clean(wikitext))
        return [("<full_article_fallback>", full_clean)], missed_headings

    extracted: list[tuple[str, str]] = []
    if want_lead:
        first_h2 = re.search(r"^==[^=\n].*?==\s*$", wikitext, re.MULTILINE)
        lead_raw = wikitext[: first_h2.start()] if first_h2 else wikitext
        lead_clean = _format_blocks(history.clean(lead_raw))
        if lead_clean:
            extracted.append(("<lead>", lead_clean))
    extracted.extend(matched_h2)
    return extracted, missed_headings


def _waya_compare(
    cur: Any,
    q_vec_text: str,
    expected_page_id: int,
    waya_as_of: str,
    limit: int,
) -> dict[str, Any]:
    """Run spec 010 Way A retrieval (global top-50 + same-page current chunk_vector) and read AS OF text."""
    retrieval_sql = """
    SELECT n.lang, n.page_id, n.chunk_no, n.d,
           c.section, c.text AS chunk_text,
           a.title, a.wikidata_id
    FROM (
      SELECT cv.lang, cv.page_id, cv.chunk_no,
             VEC_DISTANCE_COSINE(cv.embedding, VEC_FromText(?)) AS d
      FROM wikirag.chunk_vector cv
      ORDER BY d
      LIMIT 50
    ) n
    JOIN wikirag.chunk c
      ON c.lang = n.lang AND c.page_id = n.page_id AND c.chunk_no = n.chunk_no
    JOIN wikirag.article a
      ON a.lang = c.lang AND a.page_id = c.page_id
    ORDER BY n.d ASC
    """
    cur.execute(retrieval_sql, (q_vec_text,))
    top50 = cur.fetchall()

    # Collect top-3 sources and fi top-50 sections just like backend/ask.py.
    sources: list[dict[str, Any]] = []
    seen_src: set[tuple[str, int]] = set()
    top50_fi_sections: dict[int, list[str | None]] = {}
    for lang, pid, chunk_no, dist, sec, ctext, title, wid in top50:
        lang = str(lang)
        pid = int(pid)
        sec_clean = str(sec).strip() if sec is not None else None
        if lang == "fi":
            secs = top50_fi_sections.setdefault(pid, [])
            if sec_clean not in secs:
                secs.append(sec_clean)
        if (lang, pid) not in seen_src and len(sources) < 3:
            seen_src.add((lang, pid))
            sources.append(
                {
                    "lang": lang,
                    "page_id": pid,
                    "title": str(title),
                    "wikidata_id": str(wid).strip() if wid else None,
                    "top_chunk_no": int(chunk_no),
                    "top_section": sec_clean,
                    "d": float(dist),
                }
            )

    wids = sorted({s["wikidata_id"] for s in sources if s["lang"] != "fi" and s["wikidata_id"]})
    sib_by_wid: dict[str, int] = {}
    if wids:
        ph = ",".join("?" for _ in wids)
        cur.execute(
            f"SELECT wikidata_id, page_id FROM wikirag.article WHERE lang='fi' AND wikidata_id IN ({ph})",
            tuple(wids),
        )
        for wid, pid in cur.fetchall():
            sib_by_wid[str(wid).strip()] = int(pid)

    cand_pids = []
    for s in sources:
        if s["lang"] == "fi":
            cand_pids.append(s["page_id"])
        elif s["wikidata_id"] in sib_by_wid:
            cand_pids.append(sib_by_wid[s["wikidata_id"]])
    hist_pids: set[int] = set()
    if cand_pids:
        ph = ",".join("?" for _ in set(cand_pids))
        cur.execute(
            f"SELECT DISTINCT page_id FROM wikihistory.article WHERE page_id IN ({ph})",
            tuple(sorted(set(cand_pids))),
        )
        hist_pids = {int(r[0]) for r in cur.fetchall()}

    resolved_pid = expected_page_id
    resolution = "none"
    for s in sources:
        if s["lang"] == "fi" and s["page_id"] in hist_pids:
            resolved_pid = s["page_id"]
            resolution = "direct"
            break
        if s["lang"] != "fi" and s["wikidata_id"] in sib_by_wid:
            fi_pid = sib_by_wid[s["wikidata_id"]]
            if fi_pid in hist_pids:
                resolved_pid = fi_pid
                resolution = "direct" if fi_pid in top50_fi_sections else "sibling"
                break

    global_sections = top50_fi_sections.get(resolved_pid, [])

    # Also inspect current chunk_vector top chunks specifically on the resolved fi page.
    cur.execute(
        """
        SELECT cv.page_id, cv.chunk_no, c.section,
               VEC_DISTANCE_COSINE(cv.embedding, VEC_FromText(?)) AS d,
               LEFT(c.text, 200) AS preview
        FROM wikirag.chunk_vector cv
        JOIN wikirag.chunk c
          ON c.lang = cv.lang AND c.page_id = cv.page_id AND c.chunk_no = cv.chunk_no
        WHERE cv.lang = 'fi' AND cv.page_id = ?
        ORDER BY d ASC
        LIMIT ?
        """,
        (q_vec_text, resolved_pid, limit),
    )
    same_page_cur_chunks = [
        {
            "page_id": int(r[0]),
            "chunk_no": int(r[1]),
            "section": r[2],
            "d": float(r[3]),
            "preview": " ".join(str(r[4]).split())[:200],
        }
        for r in cur.fetchall()
    ]

    snap_2015 = history.as_of(cur, resolved_pid, waya_as_of, table="wikihistory.article")
    if snap_2015 is None:
        return {
            "sources": sources,
            "resolved_page_id": resolved_pid,
            "resolution": resolution,
            "global_sections": global_sections,
            "same_page_cur_chunks": same_page_cur_chunks,
            "asof_rev_id": None,
            "asof_sections_global": [],
            "asof_missed_global": [],
            "asof_sections_same_page": [],
            "asof_missed_same_page": [],
        }

    asof_sections_global, missed_global = _extract_waya_section_texts(str(snap_2015["text"]), global_sections)
    same_page_secs = []
    for ch in same_page_cur_chunks[:5]:
        if ch["section"] not in same_page_secs:
            same_page_secs.append(ch["section"])
    asof_sections_same_page, missed_same_page = _extract_waya_section_texts(str(snap_2015["text"]), same_page_secs)

    return {
        "sources": sources,
        "resolved_page_id": resolved_pid,
        "resolution": resolution,
        "global_sections": global_sections,
        "same_page_cur_chunks": same_page_cur_chunks,
        "asof_rev_id": int(snap_2015["rev_id"]),
        "asof_row_start": str(snap_2015["row_start"]),
        "asof_sections_global": [
            {"section": sec, "preview": " ".join(txt.split())[:200]}
            for sec, txt in asof_sections_global
        ],
        "asof_missed_global": missed_global,
        "asof_sections_same_page": [
            {"section": sec, "preview": " ".join(txt.split())[:200]}
            for sec, txt in asof_sections_same_page
        ],
        "asof_missed_same_page": missed_same_page,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Measure Way B queries and compare Way A vs Way B")
    parser.add_argument("--as-of", default="2015-01-01 00:00:00", help="SVT AS OF timestamp (UTC)")
    parser.add_argument("--waya-as-of", default="2014-12-31 23:59:59", help="Way A AS OF timestamp (UTC)")
    parser.add_argument("--runs", type=int, default=10, help="Warm benchmark runs per variant")
    parser.add_argument("--warmup", type=int, default=2, help="Warmup runs per variant")
    parser.add_argument("--limit", type=int, default=10, help="Top-k limit")
    parser.add_argument("--ef-search", type=int, default=EF_SEARCH_DEFAULT, help="mhnsw_ef_search")
    parser.add_argument(
        "--ollama-url",
        default=os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434"),
        help="Ollama base URL for request-time query embedding",
    )
    parser.add_argument(
        "--only-hero-1256",
        action="store_true",
        help="Only run the two Talvisota hero questions (for the single-page 1256 stage)",
    )
    args = parser.parse_args()

    questions = DEFAULT_QUESTIONS[:2] if args.only_hero_1256 else DEFAULT_QUESTIONS
    assert len(questions) <= MAX_QUERY_EMBEDDINGS, "Refusing to exceed request-time query embedding cap"

    digest = _check_ollama_digest(args.ollama_url)
    print(f"Ollama verified: model={MODEL} digest={digest} url={args.ollama_url}")

    query_vectors: dict[str, str] = {}
    embed_calls = 0
    for q_text, _, _ in questions:
        vec = _embed_query(q_text, args.ollama_url)
        query_vectors[q_text] = json.dumps(vec)
        embed_calls += 1
    print(f"Query embeddings completed: {embed_calls} calls (cap={MAX_QUERY_EMBEDDINGS})")

    con = _connect()
    cur = con.cursor()
    try:
        cur.execute("SET time_zone = '+00:00'")
        cur.execute(f"SET mhnsw_ef_search = {int(args.ef_search)}")

        cur.execute("SELECT COUNT(*), COUNT(DISTINCT page_id) FROM wikirag.chunk_vector_hist FOR SYSTEM_TIME ALL")
        hist_all, hist_pages = cur.fetchone()
        cur.execute("SELECT COUNT(*) FROM wikirag.chunk_vector_hist")
        hist_cur = cur.fetchone()[0]
        cur.execute(
            "SELECT COUNT(*) FROM wikirag.chunk_vector_hist FOR SYSTEM_TIME AS OF TIMESTAMP ?",
            (args.as_of,),
        )
        hist_asof_cnt = cur.fetchone()[0]

        cur.execute("SHOW INDEX FROM wikirag.chunk_vector_hist WHERE Index_type = 'VECTOR'")
        vec_idx_row = cur.fetchone()
        vec_index_name = str(vec_idx_row[2]) if vec_idx_row else None

        print(
            f"\n=== TABLE STATE ===\n"
            f"pages={hist_pages} all_rows={hist_all} current_rows={hist_cur} "
            f"as_of({args.as_of})_rows={hist_asof_cnt} vector_index={vec_index_name} ef_search={args.ef_search}"
        )

        lim = int(args.limit)
        sql_a = (
            "SELECT n.page_id, n.chunk_no, n.rev_id, n.section, n.d, LEFT(n.text, 200) AS preview "
            "FROM (SELECT page_id, chunk_no, rev_id, section, text, "
            "VEC_DISTANCE_COSINE(embedding, VEC_FromText(?)) d "
            f"FROM wikirag.chunk_vector_hist ORDER BY d LIMIT {lim}) n "
            "ORDER BY n.d"
        )
        sql_b = (
            "SELECT n.page_id, n.chunk_no, n.rev_id, n.section, n.d, LEFT(n.text, 200) AS preview "
            "FROM (SELECT page_id, chunk_no, rev_id, section, text, "
            "VEC_DISTANCE_COSINE(embedding, VEC_FromText(?)) d "
            "FROM wikirag.chunk_vector_hist FOR SYSTEM_TIME AS OF TIMESTAMP ? "
            f"ORDER BY d LIMIT {lim}) n "
            "ORDER BY n.d"
        )
        sql_c = (
            "SELECT n.page_id, n.chunk_no, n.rev_id, n.section, n.d, LEFT(n.text, 200) AS preview "
            "FROM (SELECT page_id, chunk_no, rev_id, section, text, "
            "VEC_DISTANCE_COSINE(embedding, VEC_FromText(?)) d "
            f"FROM wikirag.chunk_vector_hist FOR SYSTEM_TIME AS OF TIMESTAMP ? "
            f"IGNORE INDEX ({vec_index_name}) ORDER BY d LIMIT {lim}) n "
            "ORDER BY n.d"
        )

        print("\n=== VARIANT BENCHMARKS (a=current, b=AS OF index, c=AS OF scan) ===")
        for idx, (q_text, exp_pid, origin) in enumerate(questions):
            qvec_text = query_vectors[q_text]
            print(f"\n--- Q{idx + 1} [{origin}] exp_page={exp_pid}: {q_text} ---")
            var_a = _measure_variant(cur, "a_current", sql_a, (qvec_text,), args.warmup, args.runs)
            var_b = _measure_variant(cur, "b_asof", sql_b, (qvec_text, args.as_of), args.warmup, args.runs)
            variants = [var_a, var_b]
            if vec_index_name:
                var_c = _measure_variant(cur, "c_asof_scan", sql_c, (qvec_text, args.as_of), args.warmup, args.runs)
                variants.append(var_c)
            else:
                var_c = None

            for v in variants:
                an = v["analyze"]
                ex = v["explain"]
                print(
                    f"  {v['variant']:12s} | access={ex['access_type']} key={ex['key']} "
                    f"est_rows={ex['est_rows']} examined={an['r_rows_examined']} "
                    f"filtered={an['r_filtered_pct']}% returned={v['rows_returned']} "
                    f"median={v['median_ms']:.3f}ms p90={v['p90_ms']:.3f}ms "
                    f"(min={v['min_ms']:.3f} max={v['max_ms']:.3f}) "
                    f"analyze_total={an['r_total_time_ms']:.3f}ms"
                )
                print(f"    attached_condition: {ex['attached_condition']}")

            if var_c is not None:
                keys_b = {(r["page_id"], r["chunk_no"]) for r in var_b["results"]}
                keys_c = {(r["page_id"], r["chunk_no"]) for r in var_c["results"]}
                overlap = len(keys_b & keys_c)
                denom = len(keys_c)
                pct = (100.0 * overlap / denom) if denom else 0.0
                exact_order = [
                    (r["page_id"], r["chunk_no"]) for r in var_b["results"]
                ] == [(r["page_id"], r["chunk_no"]) for r in var_c["results"]]
                print(
                    f"  overlap@{lim} (b vs c): {overlap}/{denom} ({pct:.1f}%) "
                    f"exact_order={exact_order}"
                )
                missing_from_b = [
                    (r["page_id"], r["chunk_no"], r["section"], round(r["d"], 4))
                    for r in var_c["results"]
                    if (r["page_id"], r["chunk_no"]) not in keys_b
                ]
                if missing_from_b:
                    print(f"    missed_by_index_in_top{lim}: {missing_from_b}")

            if idx == 0:
                print("  EXPLAIN_RAW_A:", var_a["explain_raw"].replace("\n", " "))
                print("  EXPLAIN_RAW_B:", var_b["explain_raw"].replace("\n", " "))
                if var_c is not None:
                    print("  EXPLAIN_RAW_C:", var_c["explain_raw"].replace("\n", " "))

            # Side-by-side Way B vs Way A quality comparison.
            waya = _waya_compare(cur, qvec_text, exp_pid, args.waya_as_of, lim)
            print(f"\n  [Quality Comparison Q{idx + 1}: {q_text}]")
            print(
                f"  Way A (spec 010): top3_sources={[(s['lang'], s['page_id'], s['title'], s['top_section'], round(s['d'], 4)) for s in waya['sources']]}"
            )
            print(
                f"  Way A resolved fi page={waya['resolved_page_id']} resolution={waya['resolution']} "
                f"global_top50_sections={waya['global_sections']} asof_rev={waya.get('asof_rev_id')}"
            )
            print(
                f"  Way A AS OF text from global_top50_sections (exact spec 010 input, "
                f"missed_headings={waya['asof_missed_global']}):"
            )
            for item in waya["asof_sections_global"][:5]:
                print(f"    - [{item['section']}] {item['preview']}")
            print(
                f"  Way A current fi chunk_vector top-5 on page {waya['resolved_page_id']}:"
            )
            for item in waya["same_page_cur_chunks"][:5]:
                print(
                    f"    - chunk={item['chunk_no']} d={item['d']:.4f} [{item['section']}] {item['preview']}"
                )
            print(
                f"  Way A AS OF text for same-page current top sections (rev={waya.get('asof_rev_id')}, "
                f"missed_headings={waya['asof_missed_same_page']}):"
            )
            for item in waya["asof_sections_same_page"][:5]:
                print(f"    - [{item['section']}] {item['preview']}")
            print(f"  Way B top-{lim} AS OF {args.as_of} (from chunk_vector_hist):")
            for rank, item in enumerate(var_b["results"], 1):
                print(
                    f"    #{rank:2d} page={item['page_id']} chunk={item['chunk_no']} rev={item['rev_id']} "
                    f"d={item['d']:.4f} [{item['section']}] {item['preview']}"
                )

        print(f"\nDONE total_query_embeddings={embed_calls}")
        return 0
    finally:
        cur.close()
        con.close()


if __name__ == "__main__":
    raise SystemExit(main())
