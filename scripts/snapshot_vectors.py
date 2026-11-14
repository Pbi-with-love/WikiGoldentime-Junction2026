"""Way B staging: embed Dec-31 snapshots of the wikihistory articles into wikirag.snapshot_chunk_vector.

One snapshot per (page, year) where the year-end version's sha1 differs from the previous kept
year. Text = organizers' history.clean() blocks rendered as Markdown, chunked with spec 008's
chunk_article(), embedded with bge-m3 (OLLAMA_URL). Identical chunk text is embedded once.
Resumable: (page_id, year) already in the table is skipped. Run on the VPS, alone (no concurrent
writers). Usage: OLLAMA_URL=http://127.0.0.1:11435 .venv/bin/python snapshot_vectors.py [--selftest]
"""
import json, os, sys, time
sys.path.insert(0, os.path.expanduser("~/wikimemory"))
sys.path.insert(0, os.path.expanduser("~/wikimemory/backend"))
import mariadb
import history
from chunk import chunk_article
from embed_chunks import embed_batch_safe, MODEL

URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11435")
LAST_YEAR = 2026

DDL = """CREATE TABLE IF NOT EXISTS snapshot_chunk_vector (
  page_id INT UNSIGNED NOT NULL, year SMALLINT NOT NULL, rev_id INT UNSIGNED NOT NULL,
  row_start DATETIME(6) NOT NULL, sha1 VARCHAR(40) NOT NULL, chunk_no SMALLINT UNSIGNED NOT NULL,
  section VARCHAR(255) NULL, text MEDIUMTEXT NOT NULL, model VARCHAR(32) NOT NULL,
  embedding VECTOR(1024) NOT NULL, PRIMARY KEY (page_id, year, chunk_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"""


def to_markdown(title, blocks):
    lines = [f"# {title}"]
    for kind, text in blocks:
        lines.append(f"## {text}" if kind == "h" else (f"- {text}" if kind == "li" else text))
    return "\n".join(lines)


def selftest():
    md = to_markdown("T", [("p", "intro"), ("h", "Rauha"), ("li", "a"), ("p", "b")])
    assert md == "# T\nintro\n## Rauha\n- a\nb", md
    assert chunk_article("T", md)[0][4] == md  # short text -> one reused-style chunk
    print("SELFTEST OK")


def main():
    con = mariadb.connect(host="127.0.0.1", port=3307, user="wikirag", password="wikirag", database="wikirag")
    cur = con.cursor()
    cur.execute("SET time_zone = '+00:00'")
    cur.execute(DDL)
    cur.execute("SELECT page_id FROM wikihistory.article_list ORDER BY page_id")
    pages = [p for (p,) in cur.fetchall()]
    cur.execute("SELECT DISTINCT page_id, year FROM snapshot_chunk_vector")
    done = set(cur.fetchall())
    cache, n_rows, n_embedded, t0 = {}, 0, 0, time.monotonic()
    hcon = mariadb.connect(host="127.0.0.1", port=3307, user="wikirag", password="wikirag", database="wikihistory")
    hcur = hcon.cursor()  # history.rows() builds the dicts itself
    hcur.execute("SET time_zone = '+00:00'")
    for pid in pages:
        cur.execute("SELECT YEAR(MIN(row_start)) FROM wikihistory.article FOR SYSTEM_TIME ALL WHERE page_id=?", (pid,))
        first = cur.fetchone()[0]
        prev_sha = None
        for year in range(first, LAST_YEAR + 1):
            snap = history.as_of(hcur, pid, f"{year}-12-31 23:59:59")
            if not snap:
                continue
            cur.execute("SELECT sha1 FROM wikihistory.article FOR SYSTEM_TIME ALL WHERE page_id=? AND rev_id=? LIMIT 1",
                        (pid, snap["rev_id"]))
            sha = cur.fetchone()[0]
            if sha == prev_sha:
                continue
            prev_sha = sha
            if (pid, year) in done:
                continue
            chunks = chunk_article(snap["title"], to_markdown(snap["title"], history.clean(snap["text"])))
            todo = [c[4] for c in chunks if c[4] not in cache]
            for i in range(0, len(todo), 64):
                vecs, _, _ = embed_batch_safe(todo[i:i + 64], ollama_url=URL)
                cache.update(zip(todo[i:i + 64], vecs)); n_embedded += len(vecs)
            cur.executemany(
                "INSERT INTO snapshot_chunk_vector (page_id, year, rev_id, row_start, sha1, chunk_no, section, text, model, embedding) "
                "VALUES (?,?,?,?,?,?,?,?,?,VEC_FromText(?))",
                [(pid, year, snap["rev_id"], snap["row_start"], sha, no, (sec or "")[:255] or None, txt, MODEL,
                  json.dumps(cache[txt])) for no, sec, _, _, txt in chunks])
            con.commit(); n_rows += len(chunks)
        print(f"page {pid}: rows so far {n_rows}, embedded {n_embedded}, {time.monotonic()-t0:.0f}s", flush=True)
    cur.execute("SELECT COUNT(*), COUNT(DISTINCT page_id), COUNT(DISTINCT page_id, year) FROM snapshot_chunk_vector")
    print("DONE rows, pages, snapshots =", cur.fetchone(), f"embedded {n_embedded} unique texts in {time.monotonic()-t0:.0f}s")


if __name__ == "__main__":
    selftest() if "--selftest" in sys.argv else main()
