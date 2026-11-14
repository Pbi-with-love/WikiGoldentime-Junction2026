#!/usr/bin/env python3
"""Split wikirag.article into section chunks and store them in wikirag.chunk.

Creates both wikirag.chunk and wikirag.chunk_vector if missing. Refuses to run
if wikirag.chunk is already non-empty unless --rebuild is passed (which drops
and recreates both chunk_vector and chunk).
"""

import argparse
import os
import sys
import time

DROP_SECTIONS = frozenset(
    {
        # Finnish
        "lähteet",
        "viitteet",
        "kirjallisuutta",
        "aiheesta muualla",
        "katso myös",
        # Swedish
        "källor",
        "referenser",
        "noter",
        "externa länkar",
        "se även",
        # English
        "references",
        "notes",
        "external links",
        "see also",
        "further reading",
    }
)

WINDOW_WORDS = 300
STEP_WORDS = 250
OVERLAP_WORDS = WINDOW_WORDS - STEP_WORDS
BATCH_SIZE = 500
EF_SEARCH = 80

CREATE_CHUNK_SQL = """
CREATE TABLE IF NOT EXISTS chunk (
  lang CHAR(2) NOT NULL,
  page_id INT(10) UNSIGNED NOT NULL,
  chunk_no SMALLINT UNSIGNED NOT NULL,
  rev_id INT(10) UNSIGNED NOT NULL,
  section VARCHAR(255) NULL,
  words SMALLINT UNSIGNED NOT NULL,
  reused TINYINT(1) NOT NULL DEFAULT 0,
  text TEXT NOT NULL,
  PRIMARY KEY (lang, page_id, chunk_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci
"""

CREATE_CHUNK_VECTOR_SQL = """
CREATE TABLE IF NOT EXISTS chunk_vector (
  lang CHAR(2) NOT NULL,
  page_id INT(10) UNSIGNED NOT NULL,
  chunk_no SMALLINT UNSIGNED NOT NULL,
  model VARCHAR(50) NOT NULL,
  embedding VECTOR(1024) NOT NULL,
  PRIMARY KEY (lang, page_id, chunk_no),
  VECTOR INDEX (embedding) M=16 DISTANCE=cosine
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci
"""


def chunk_article(title: str, text: str) -> list[tuple[int, str | None, int, int, str]]:
    """Return [(chunk_no, section, words, reused, chunk_text), ...] for one article."""
    sections: list[tuple[str | None, list[str]]] = []
    current_section: str | None = None
    buf: list[str] = []
    in_intro = True
    skipped_h1 = False

    for line in text.splitlines():
        if line.startswith("## "):
            sections.append((current_section, buf))
            current_section = line[3:].strip()
            buf = []
            in_intro = False
        else:
            if in_intro and not skipped_h1 and line.startswith("# "):
                skipped_h1 = True
                continue
            buf.append(line)
    sections.append((current_section, buf))

    kept: list[tuple[str | None, list[str]]] = []
    for sec, sec_lines in sections:
        if sec is not None and sec.strip().lower() in DROP_SECTIONS:
            continue
        words = "\n".join(sec_lines).split()
        if not words:
            continue
        kept.append((sec, words))

    remaining_words = sum(len(words) for _, words in kept)
    if remaining_words <= WINDOW_WORDS:
        return [(0, None, len(text.split()), 1, text)]

    chunks: list[tuple[int, str | None, int, int, str]] = []
    chunk_no = 0
    for sec, words in kept:
        prefix = f"{title} \u2014 {sec}" if sec is not None else title
        for start in range(0, max(len(words) - OVERLAP_WORDS, 1), STEP_WORDS):
            window = words[start : start + WINDOW_WORDS]
            chunk_text = f"{prefix}\n\n{' '.join(window)}"
            chunks.append((chunk_no, sec, len(chunk_text.split()), 0, chunk_text))
            chunk_no += 1
    return chunks


def run_selftest() -> int:
    """Verify chunking rules on synthetic articles without a database."""
    intro_words = [f"intro{i}" for i in range(40)]
    sec1_words = [f"s1_{i}" for i in range(60)]
    sec2_words = [f"w{i}" for i in range(700)]

    synthetic = "\n".join(
        [
            "# Testiartikkeli",
            " ".join(intro_words),
            "",
            "## Historia",
            " ".join(sec1_words[:20]),
            "### Varhaisvaihe",
            " ".join(sec1_words[20:]),
            "",
            "## Tyhjä osio",
            "   ",
            "",
            "## Pitkä osio",
            " ".join(sec2_words),
            "",
            "## Lähteet",
            "Tämä osio tulee poistaa kokonaan.",
        ]
    )

    chunks = chunk_article("Testiartikkeli", synthetic)
    # Expect: 1 intro + 1 Historia (with ### inside) + 3 Pitkä osio (0, 250, 500) = 5 chunks
    assert len(chunks) == 5, f"Expected 5 chunks, got {len(chunks)}: {chunks}"
    assert [c[0] for c in chunks] == [0, 1, 2, 3, 4]
    assert all(c[3] == 0 for c in chunks)

    # Intro chunk
    assert chunks[0][1] is None
    assert chunks[0][4] == f"Testiartikkeli\n\n{' '.join(intro_words)}"

    # Historia chunk preserves ### heading inside section and uses em-dash prefix
    assert chunks[1][1] == "Historia"
    assert chunks[1][4].startswith("Testiartikkeli \u2014 Historia\n\n")
    assert "### Varhaisvaihe" in chunks[1][4]

    # Empty section and Lähteet dropped
    sections_present = {c[1] for c in chunks}
    assert "Tyhjä osio" not in sections_present
    assert "Lähteet" not in sections_present

    # 700-word section -> 3 windows starting at 0, 250, 500
    long_chunks = [c for c in chunks if c[1] == "Pitkä osio"]
    assert len(long_chunks) == 3
    expected_prefix = "Testiartikkeli \u2014 Pitkä osio\n\n"
    expected_slices = [(0, 300), (250, 550), (500, 700)]
    for c, (s, e) in zip(long_chunks, expected_slices):
        assert c[4] == expected_prefix + " ".join(sec2_words[s:e])

    # Short article (<= 300 remaining words even when dropped Lähteet pushes total > 300)
    short_text = (
        "# Lyhyt\n"
        + " ".join(f"a{i}" for i in range(250))
        + "\n\n##   LÄHTEET  \n"
        + " ".join(f"r{i}" for i in range(100))
    )
    short_chunks = chunk_article("Lyhyt", short_text)
    assert len(short_chunks) == 1
    assert short_chunks[0] == (0, None, len(short_text.split()), 1, short_text)

    # Minimal article with only title
    empty_body = "# Spear Air\n"
    empty_chunks = chunk_article("Spear Air", empty_body)
    assert empty_chunks == [(0, None, 3, 1, empty_body)]

    print(
        "SELFTEST PASS: intro, ### subsection, empty section, dropped Lähteet, "
        "700-word 3-window split (0,250,500), short-article reuse, em-dash prefix."
    )
    return 0


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


def ensure_tables(cur, rebuild: bool) -> None:
    """Create chunk and chunk_vector tables; drop both first if rebuild=True."""
    if rebuild:
        cur.execute("DROP TABLE IF EXISTS chunk_vector")
        cur.execute("DROP TABLE IF EXISTS chunk")
    cur.execute(CREATE_CHUNK_SQL)
    cur.execute(CREATE_CHUNK_VECTOR_SQL)


def copy_reused_vectors(con, cur) -> int:
    """Copy existing article vectors for single-chunk articles into chunk_vector."""
    cur.execute(
        "INSERT IGNORE INTO chunk_vector (lang, page_id, chunk_no, model, embedding) "
        "SELECT c.lang, c.page_id, c.chunk_no, av.model, av.embedding "
        "FROM chunk c "
        "JOIN article_vector av USING (lang, page_id) "
        "WHERE c.reused = 1"
    )
    copied = cur.rowcount
    con.commit()
    return copied


def verify_chunks(cur) -> None:
    """Verify article coverage, short-article non-truncated invariant, and reused vectors."""
    cur.execute(
        "SELECT COUNT(*) FROM article a "
        "LEFT JOIN chunk c USING (lang, page_id) "
        "WHERE c.page_id IS NULL"
    )
    missing_articles = cur.fetchone()[0]
    assert missing_articles == 0, f"Articles missing from chunk: {missing_articles}"

    cur.execute(
        "SELECT COUNT(*) FROM chunk c "
        "JOIN article_vector av USING (lang, page_id) "
        "WHERE c.reused = 1 AND av.truncated != 0"
    )
    bad_reuse = cur.fetchone()[0]
    assert bad_reuse == 0, f"Found {bad_reuse} reused=1 chunks whose article_vector.truncated != 0"

    cur.execute(
        "SELECT COUNT(*) FROM chunk c "
        "LEFT JOIN chunk_vector cv USING (lang, page_id, chunk_no) "
        "WHERE c.reused = 1 AND cv.page_id IS NULL"
    )
    missing_reused_vecs = cur.fetchone()[0]
    assert missing_reused_vecs == 0, (
        f"Found {missing_reused_vecs} reused=1 chunks missing from chunk_vector"
    )

    cur.execute(
        "SELECT lang, COUNT(DISTINCT page_id), COUNT(*), SUM(reused) "
        "FROM chunk GROUP BY lang ORDER BY lang"
    )
    summary = {lang: {"articles": a, "chunks": c, "reused": int(r)} for lang, a, c, r in cur.fetchall()}
    cur.execute("SELECT lang, COUNT(*) FROM chunk_vector GROUP BY lang ORDER BY lang")
    vec_summary = dict(cur.fetchall())
    print(
        f"VERIFIED: chunks={summary}, chunk_vector={vec_summary}, "
        f"missing_articles=0, bad_reuse=0, missing_reused_vecs=0"
    )


def parse_args():
    parser = argparse.ArgumentParser(description="Chunk wikirag.article into wikirag.chunk.")
    parser.add_argument("--selftest", action="store_true", help="Run offline unit checks and exit.")
    parser.add_argument(
        "--rebuild",
        action="store_true",
        help="Drop and recreate BOTH chunk_vector and chunk before chunking.",
    )
    parser.add_argument("--db-host", default=os.environ.get("DB_HOST", "127.0.0.1"))
    parser.add_argument("--db-port", type=int, default=int(os.environ.get("DB_PORT", 3307)))
    parser.add_argument("--db-user", default=os.environ.get("DB_USER", "wikirag"))
    parser.add_argument("--db-password", default=os.environ.get("DB_PASSWORD", "wikirag"))
    parser.add_argument("--db-name", default=os.environ.get("DB_NAME", "wikirag"))
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.selftest:
        return run_selftest()

    t0 = time.monotonic()
    con = connect(args.db_host, args.db_port, args.db_user, args.db_password, args.db_name)
    try:
        read_cur = con.cursor()
        write_cur = con.cursor()

        ensure_tables(write_cur, rebuild=args.rebuild)
        con.commit()

        write_cur.execute("SELECT COUNT(*) FROM chunk")
        existing = write_cur.fetchone()[0]
        if existing > 0:
            print(
                f"ERROR: wikirag.chunk already has {existing} rows; pass --rebuild to drop and recreate both chunk_vector and chunk.",
                file=sys.stderr,
            )
            return 1

        read_cur.execute(
            "SELECT lang, page_id, rev_id, title, text FROM article ORDER BY lang, page_id"
        )
        articles = read_cur.fetchall()

        insert_sql = (
            "INSERT INTO chunk (lang, page_id, chunk_no, rev_id, section, words, reused, text) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        batch = []
        total_chunks = 0
        for lang, page_id, rev_id, title, text in articles:
            for chunk_no, section, words, reused, chunk_text in chunk_article(title, text):
                batch.append((lang, page_id, chunk_no, rev_id, section, words, reused, chunk_text))
                total_chunks += 1
                if len(batch) >= BATCH_SIZE:
                    write_cur.executemany(insert_sql, batch)
                    con.commit()
                    batch.clear()
        if batch:
            write_cur.executemany(insert_sql, batch)
            con.commit()

        copied_reused = copy_reused_vectors(con, write_cur)
        verify_chunks(write_cur)
        read_cur.close()
        write_cur.close()
        print(
            f"Chunked {len(articles)} articles into {total_chunks} chunks "
            f"(copied {copied_reused} reused vectors) in {time.monotonic() - t0:.1f}s"
        )
    finally:
        con.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
