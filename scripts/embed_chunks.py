#!/usr/bin/env python3
"""Embed wikirag.chunk rows into wikirag.chunk_vector using local Ollama (bge-m3).

Designed to run on the Mac against local Ollama (http://127.0.0.1:11434) and
MariaDB through an SSH tunnel (127.0.0.1:3307). Checks that local bge-m3
matches the VPS digest (790764642607) before starting, ensures reused=1 single-
chunk articles have their article_vector copied in SQL, and embeds remaining
chunks in batches of --batch, committing after every batch for resumability.
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

MODEL = "bge-m3"
EXPECTED_DIGEST = "790764642607"
CONTEXT = 8192
OPTIONS = {"num_ctx": CONTEXT, "num_batch": CONTEXT}
EF_SEARCH = 80
LANG_ORDER = ("fi", "sv", "en")

# Expected Finnish answer titles from ~/mariadb-vector-wikipedia-rag/data/test-questions.tsv
TEST_QUESTION_FI_TITLES = (
    "Suomen itsenäisyysjulistus",
    "Talvisota",
    "Suomen sisällissota",
    "Moskovan rauhansopimus (1940)",
    "Mannerheim-linja",
    "Suomen suuriruhtinaskunta",
    "Isoviha",
    "Nuijasota",
    "Mannerheimin murhayritys 1920",
    "Kuorsumaan torpparikapina",
    "Sähköisen äänestyksen kokeilu kunnallisvaaleissa 2008",
    "Jatkosota",
    "Lapin sota",
    "Tarton rauha",
    "Ahvenanmaan kysymys",
    "YYA-sopimus",
    "Suomen sota",
    "Hakkapeliitat",
    "Turun palo",
    "Säätyvaltiopäivät 1882",
    "Porkkalan vuokra-alue",
    "Suomettuminen",
    "Suomen 1990-luvun alun lama",
    "Siirtoväki",
    "Sortovuodet",
    "Jääkäriliike",
    "Mäntsälän kapina",
    "Helmikuun manifesti",
    "Pähkinäsaaren rauha",
    "Anjalan liitto",
    "Ryti–Ribbentrop-sopimus",
    "Pariisin rauhansopimus (1947)",
    "Urho Kekkonen",
    "P. E. Svinhufvud",
    "K. J. Ståhlberg",
    "Carl Gustaf Emil Mannerheim",
    "Juho Kusti Paasikivi",
)


def connect(host: str, port: int, user: str, password: str, database: str):
    """Connect using mariadb driver and session settings matching common.py."""
    import mariadb

    con = mariadb.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        database=database,
        autocommit=False,
    )
    cur = con.cursor()
    cur.execute(f"SET mhnsw_ef_search = {EF_SEARCH}")
    cur.close()
    return con


def check_ollama_digest(ollama_url: str, expected_digest: str) -> str:
    """Verify Ollama has bge-m3 with the expected digest; exit non-zero otherwise."""
    url = f"{ollama_url.rstrip('/')}/api/tags"
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        print(
            f"ERROR: Could not query Ollama at {url}: {exc}\n"
            "Make sure Ollama is running locally (e.g. 'ollama serve').",
            file=sys.stderr,
        )
        sys.exit(1)

    models = data.get("models") or []
    match = None
    for entry in models:
        names = {entry.get("name"), entry.get("model")}
        if MODEL in names or f"{MODEL}:latest" in names:
            match = entry
            break

    if match is None:
        print(
            f"ERROR: Model '{MODEL}' not found in Ollama at {ollama_url}.\n"
            f"Run 'ollama pull {MODEL}' and verify digest starts with '{expected_digest}'.",
            file=sys.stderr,
        )
        sys.exit(1)

    digest = match.get("digest", "")
    if not digest.startswith(expected_digest):
        print(
            f"ERROR: Ollama '{MODEL}' digest mismatch: got '{digest[:12]}' (full: {digest}), "
            f"expected prefix '{expected_digest}'. Stop and verify model version.",
            file=sys.stderr,
        )
        sys.exit(1)

    return digest


def embed_texts(
    texts: list[str],
    ollama_url: str,
    truncate: bool = False,
) -> tuple[list[list[float]], int]:
    """Call Ollama /api/embed matching common.embed() request format."""
    url = f"{ollama_url.rstrip('/')}/api/embed"
    payload = json.dumps(
        {
            "model": MODEL,
            "input": texts,
            "truncate": truncate,
            "options": OPTIONS,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=600) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise ValueError(f"Ollama HTTP {exc.code}: {body}") from exc
    return data["embeddings"], int(data.get("prompt_eval_count", 0) or 0)


def embed_batch_safe(
    texts: list[str],
    ollama_url: str,
) -> tuple[list[list[float]], int, int]:
    """Embed a batch with truncate=False, falling back item-by-item if too long."""
    try:
        vectors, tokens = embed_texts(texts, ollama_url=ollama_url, truncate=False)
        return vectors, tokens, 0
    except ValueError:
        vectors: list[list[float]] = []
        total_tokens = 0
        truncated_count = 0
        for text in texts:
            try:
                v, k = embed_texts([text], ollama_url=ollama_url, truncate=False)
            except ValueError:
                v, k = embed_texts([text], ollama_url=ollama_url, truncate=True)
                truncated_count += 1
            vectors.extend(v)
            total_tokens += k
        return vectors, total_tokens, truncated_count


def format_duration(seconds: float) -> str:
    """Format seconds as HHh MMm SSs."""
    if seconds < 0 or seconds == float("inf"):
        return "?"
    total = int(round(seconds))
    hours, rem = divmod(total, 3600)
    minutes, secs = divmod(rem, 60)
    if hours > 0:
        return f"{hours}h{minutes:02d}m{secs:02d}s"
    if minutes > 0:
        return f"{minutes}m{secs:02d}s"
    return f"{secs}s"


def resolve_small_pages(cur, lang_filter: str | None) -> list[tuple[str, int]]:
    """Resolve test-question answers + 50 wikihistory.article_list pages (with lang siblings)."""
    cur.execute("SELECT page_id FROM wikihistory.article_list")
    hist_pids = {int(pid) for (pid,) in cur.fetchall()}

    placeholders = ", ".join(["?"] * len(TEST_QUESTION_FI_TITLES))
    cur.execute(
        f"SELECT page_id FROM article WHERE lang = 'fi' AND title IN ({placeholders})",
        list(TEST_QUESTION_FI_TITLES),
    )
    tq_pids = {int(pid) for (pid,) in cur.fetchall()}
    fi_pids = sorted(hist_pids | tq_pids)
    if not fi_pids:
        return []

    fi_placeholders = ", ".join(["?"] * len(fi_pids))
    cur.execute(
        f"SELECT DISTINCT wikidata_id FROM article "
        f"WHERE lang = 'fi' AND page_id IN ({fi_placeholders}) AND wikidata_id IS NOT NULL",
        fi_pids,
    )
    wids = [wid for (wid,) in cur.fetchall()]

    pages: set[tuple[str, int]] = {("fi", pid) for pid in fi_pids}
    if wids:
        w_placeholders = ", ".join(["?"] * len(wids))
        cur.execute(
            f"SELECT lang, page_id FROM article WHERE wikidata_id IN ({w_placeholders})",
            wids,
        )
        for lang, pid in cur.fetchall():
            pages.add((lang, int(pid)))

    if lang_filter:
        pages = {(l, p) for (l, p) in pages if l == lang_filter}

    order_idx = {l: i for i, l in enumerate(LANG_ORDER)}
    return sorted(pages, key=lambda pair: (order_idx.get(pair[0], 99), pair[1]))


def populate_target_pages(con, cur, pages_from: str, lang_filter: str | None) -> bool:
    """Create TEMPORARY TABLE _target_pages if scoped to small or a file; return True if active."""
    if pages_from == "all":
        return False

    if pages_from == "small":
        pages = resolve_small_pages(cur, lang_filter)
    else:
        if not os.path.isfile(pages_from):
            raise FileNotFoundError(f"--pages-from file not found: {pages_from}")
        pages_set: set[tuple[str, int]] = set()
        with open(pages_from, encoding="utf-8") as f:
            for raw in f:
                line = raw.strip()
                if not line or line.startswith("#"):
                    continue
                parts = line.replace(",", " ").split()
                if len(parts) == 1 and parts[0].isdigit():
                    pair = (lang_filter or "fi", int(parts[0]))
                elif len(parts) >= 2 and parts[0] in LANG_ORDER and parts[1].isdigit():
                    pair = (parts[0], int(parts[1]))
                else:
                    continue
                if not lang_filter or pair[0] == lang_filter:
                    pages_set.add(pair)
        order_idx = {l: i for i, l in enumerate(LANG_ORDER)}
        pages = sorted(pages_set, key=lambda p: (order_idx.get(p[0], 99), p[1]))

    assert pages, f"No pages resolved for --pages-from {pages_from!r}"
    cur.execute("DROP TEMPORARY TABLE IF EXISTS _target_pages")
    cur.execute(
        "CREATE TEMPORARY TABLE _target_pages ("
        "  lang CHAR(2) NOT NULL,"
        "  page_id INT(10) UNSIGNED NOT NULL,"
        "  PRIMARY KEY (lang, page_id)"
        ")"
    )
    cur.executemany("INSERT IGNORE INTO _target_pages (lang, page_id) VALUES (?, ?)", pages)
    con.commit()

    cur.execute("SELECT lang, COUNT(*) FROM _target_pages GROUP BY lang ORDER BY lang")
    per_lang = dict(cur.fetchall())
    print(f"Target pages ({pages_from}): {len(pages)} total {per_lang}", flush=True)
    return True


def reuse_short_article_vectors(con, cur, lang_filter: str | None, use_target_table: bool) -> int:
    """Copy article_vector rows for reused=1 chunks directly in SQL."""
    join_target = "JOIN _target_pages tp USING (lang, page_id) " if use_target_table else ""
    where_lang = " AND c.lang = ?" if lang_filter else ""
    params = (lang_filter,) if lang_filter else ()

    check_sql = (
        f"SELECT COUNT(*) FROM chunk c "
        f"{join_target}"
        f"JOIN article_vector av USING (lang, page_id) "
        f"WHERE c.reused = 1 AND av.truncated != 0{where_lang}"
    )
    cur.execute(check_sql, params)
    bad = cur.fetchone()[0]
    assert bad == 0, f"Found {bad} reused=1 chunks with article_vector.truncated != 0"

    insert_sql = (
        f"INSERT IGNORE INTO chunk_vector (lang, page_id, chunk_no, model, embedding) "
        f"SELECT c.lang, c.page_id, c.chunk_no, av.model, av.embedding "
        f"FROM chunk c "
        f"{join_target}"
        f"JOIN article_vector av USING (lang, page_id) "
        f"LEFT JOIN chunk_vector cv USING (lang, page_id, chunk_no) "
        f"WHERE c.reused = 1 AND cv.page_id IS NULL{where_lang}"
    )
    cur.execute(insert_sql, params)
    copied = cur.rowcount
    con.commit()
    return copied


def verify_end_state(cur, pages_from: str, lang_filter: str | None, use_target_table: bool) -> None:
    """Verify chunk_vector completeness and single-model invariant for completed scope."""
    join_target = "JOIN _target_pages tp USING (lang, page_id) " if use_target_table else ""
    where_lang = "WHERE c.lang = ?" if lang_filter else ""
    params = (lang_filter,) if lang_filter else ()

    cur.execute(
        f"SELECT COUNT(*) FROM chunk c {join_target}"
        f"LEFT JOIN chunk_vector cv USING (lang, page_id, chunk_no) "
        f"WHERE cv.page_id IS NULL" + (" AND c.lang = ?" if lang_filter else ""),
        params,
    )
    missing = cur.fetchone()[0]
    assert missing == 0, f"Missing chunk_vector rows for scope={pages_from}: {missing}"

    cur.execute("SELECT COUNT(DISTINCT model) FROM chunk_vector")
    models = cur.fetchone()[0]
    assert models == 1, f"Expected 1 distinct model in chunk_vector, got {models}"

    if pages_from == "all" and not lang_filter:
        cur.execute("SELECT COUNT(*) FROM chunk")
        n_chunks = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM chunk_vector")
        n_vecs = cur.fetchone()[0]
        cur.execute(
            "SELECT COUNT(*) FROM chunk_vector cv "
            "LEFT JOIN chunk c USING (lang, page_id, chunk_no) "
            "WHERE c.page_id IS NULL"
        )
        extra = cur.fetchone()[0]
        assert n_vecs == n_chunks, f"chunk_vector count {n_vecs} != chunk count {n_chunks}"
        assert extra == 0, f"chunk_vector -> chunk anti-join = {extra}"
        print(
            f"VERIFIED (all): chunk_vector={n_vecs} == chunk={n_chunks}, "
            f"anti_joins=(0, 0), distinct_models={models}",
            flush=True,
        )
    else:
        cur.execute(f"SELECT COUNT(*) FROM chunk c {join_target}{where_lang}", params)
        scoped_chunks = cur.fetchone()[0]
        print(
            f"VERIFIED ({pages_from}, lang={lang_filter or 'all'}): "
            f"scoped_chunks={scoped_chunks}, missing=0, distinct_models={models}",
            flush=True,
        )


def parse_args():
    parser = argparse.ArgumentParser(description="Embed wikirag.chunk into wikirag.chunk_vector.")
    parser.add_argument("--db-host", default=os.environ.get("DB_HOST", "127.0.0.1"))
    parser.add_argument("--db-port", type=int, default=int(os.environ.get("DB_PORT", 3307)))
    parser.add_argument("--db-user", default=os.environ.get("DB_USER", "wikirag"))
    parser.add_argument("--db-password", default=os.environ.get("DB_PASSWORD", "wikirag"))
    parser.add_argument("--db-name", default=os.environ.get("DB_NAME", "wikirag"))
    parser.add_argument(
        "--ollama-url",
        default=os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434"),
    )
    parser.add_argument(
        "--expected-digest",
        default=EXPECTED_DIGEST,
        help="Required bge-m3 digest prefix matching the VPS Ollama model",
    )
    parser.add_argument(
        "--pages-from",
        default=None,
        help="'small' (test questions + wikihistory.article_list), 'all', or path to page list file",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Embed all missing chunks (alias for --pages-from all)",
    )
    parser.add_argument("--lang", choices=LANG_ORDER, help="Embed only this language")
    parser.add_argument("--batch", type=int, default=16, help="Chunks per /api/embed request")
    parser.add_argument("--limit", type=int, help="Stop after embedding this many non-reused chunks")
    parser.add_argument(
        "--log-interval",
        type=float,
        default=30.0,
        help="Seconds between progress lines",
    )
    args = parser.parse_args()
    if args.all and args.pages_from not in (None, "all"):
        parser.error("Cannot combine --all with --pages-from " + str(args.pages_from))
    if args.pages_from is None:
        args.pages_from = "all"
    return args


def main() -> int:
    args = parse_args()
    wall_start = time.monotonic()

    digest = check_ollama_digest(args.ollama_url, args.expected_digest)
    print(f"Ollama verified: {MODEL} digest={digest[:12]} at {args.ollama_url}", flush=True)

    con = connect(args.db_host, args.db_port, args.db_user, args.db_password, args.db_name)
    cur = con.cursor()

    try:
        use_target = populate_target_pages(con, cur, args.pages_from, args.lang)
        copied = reuse_short_article_vectors(con, cur, args.lang, use_target)

        join_target = "JOIN _target_pages tp USING (lang, page_id) " if use_target else ""
        where_lang = "WHERE c.lang = ?" if args.lang else ""
        params = (args.lang,) if args.lang else ()

        cur.execute(f"SELECT COUNT(*) FROM chunk c {join_target}{where_lang}", params)
        total = cur.fetchone()[0]

        cur.execute(
            f"SELECT COUNT(*) FROM chunk c {join_target}"
            f"JOIN chunk_vector cv USING (lang, page_id, chunk_no) {where_lang}",
            params,
        )
        already = cur.fetchone()[0]

        remaining = total - already
        goal = min(remaining, args.limit) if args.limit is not None else remaining
        print(
            f"Scope={args.pages_from} lang={args.lang or 'all'}: copied_reused={copied}, "
            f"already={already}/{total}, remaining={remaining}, goal={goal}, "
            f"batch={args.batch}, model={MODEL}",
            flush=True,
        )

        next_sql = (
            f"SELECT c.lang, c.page_id, c.chunk_no, c.text "
            f"FROM chunk c "
            f"{join_target}"
            f"LEFT JOIN chunk_vector cv USING (lang, page_id, chunk_no) "
            f"WHERE c.lang = ? AND cv.page_id IS NULL "
            f"ORDER BY c.lang, c.page_id, c.chunk_no "
            f"LIMIT ?"
        )
        save_sql = (
            "INSERT INTO chunk_vector (lang, page_id, chunk_no, model, embedding) "
            "VALUES (?, ?, ?, ?, VEC_FromText(?))"
        )

        target_langs = [args.lang] if args.lang else list(LANG_ORDER)
        done = 0
        tokens = 0
        truncated_chunks = 0
        embed_start = time.monotonic()
        last_log = 0.0
        interrupted = False

        try:
            for lang in target_langs:
                while done < goal:
                    take = min(args.batch, goal - done)
                    cur.execute(next_sql, (lang, take))
                    batch = cur.fetchall()
                    if not batch:
                        break

                    texts = [row[3] for row in batch]
                    vectors, batch_tokens, batch_trunc = embed_batch_safe(
                        texts, ollama_url=args.ollama_url
                    )
                    assert len(vectors) == len(batch), (
                        f"Expected {len(batch)} vectors, got {len(vectors)}"
                    )

                    rows = [
                        (r_lang, pid, cno, MODEL, json.dumps(vec))
                        for (r_lang, pid, cno, _), vec in zip(batch, vectors)
                    ]
                    cur.executemany(save_sql, rows)
                    con.commit()

                    done += len(batch)
                    tokens += batch_tokens
                    truncated_chunks += batch_trunc

                    now = time.monotonic()
                    if done == len(batch) or (now - last_log) >= args.log_interval or done >= goal:
                        elapsed = max(now - embed_start, 1e-6)
                        rate = done / elapsed
                        tok_s = tokens / elapsed
                        eta = (remaining - done) / rate if rate > 0 else float("inf")
                        last_lang, last_pid, last_cno, _ = batch[-1]
                        print(
                            f"[{last_lang}] {already + done}/{total} (+{done}/{goal}) | "
                            f"{rate:.3f} chunks/s | {tok_s:.0f} tok/s | "
                            f"ETA {format_duration(eta)} | last {last_lang}:{last_pid}#{last_cno}",
                            flush=True,
                        )
                        last_log = now
        except KeyboardInterrupt:
            con.rollback()
            interrupted = True
            print("\nInterrupted; rolled back uncommitted batch. Safe to rerun to resume.", flush=True)

        total_wall = time.monotonic() - wall_start
        embed_wall = max(time.monotonic() - embed_start, 1e-6)
        rate = done / embed_wall if done > 0 else 0.0
        print(
            f"Summary: done={done}, truncated={truncated_chunks}, "
            f"avg_rate={rate:.3f} chunks/s, total_wall={total_wall:.1f}s",
            flush=True,
        )

        if interrupted:
            return 130
        if args.limit is None:
            verify_end_state(cur, args.pages_from, args.lang, use_target)
    finally:
        cur.close()
        con.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
