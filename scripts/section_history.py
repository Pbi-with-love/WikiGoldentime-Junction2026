#!/usr/bin/env python3
"""Precompute section history + ghost sections for every fi history page (spec 018, no LLM).

Fills `wikihistory.section_history` (one row per page, JSON = the response shape) on MariaDB 3307
through `backend.summary.build_section_history_row`, which reuses the old SVT path unchanged.
Resumable: a page with a fresh row is skipped. Run in tmux with nice:
  tmux new -d -s shist 'cd ~/wikimemory && nice -n 19 /usr/bin/time -v .venv/bin/python scripts/section_history.py >> section_history.log 2>&1; echo EXIT=$? >> section_history.log'
"""

from __future__ import annotations

import argparse
import json
import os
import random
import statistics
import sys
import time

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

COMMIT_EVERY = 50
DEFAULT_SLEEP = 0.1
GHOST_KEYS = {"after_no", "heading", "from_year", "removed_year", "text", "oldid"}
PINNED = {1256: (14, 5), 1150: (11, 4), 440: (6, 1)}  # page_id -> (sections, ghosts) on 2026-11-14
BEFORE_FILE = os.path.expanduser("~/wikimemory/s018_before_{}.json")

HISTORY_PAGES_SQL = (
    "SELECT COUNT(*) FROM wikihistory.article a "
    "JOIN wikirag.article r ON r.lang = 'fi' AND r.page_id = a.page_id"
)
TODO_SQL = """
SELECT a.page_id FROM wikihistory.article a
JOIN wikirag.article r ON r.lang = 'fi' AND r.page_id = a.page_id
LEFT JOIN wikihistory.section_history h
  ON h.page_id = a.page_id AND h.rev_id = r.rev_id AND h.svt_rev_id = a.rev_id
 AND h.end_year >= YEAR(UTC_TIMESTAMP())
WHERE h.page_id IS NULL ORDER BY CRC32(a.page_id), a.page_id
"""
ROWS_SQL = "SELECT page_id, end_year, sections, ghosts, json, build_ms FROM wikihistory.section_history ORDER BY page_id"


def check_row(row: dict) -> dict:
    """B6.2 invariants of one table row; raises AssertionError naming the page. Returns the parsed JSON."""
    pid = row["page_id"]
    obj = json.loads(row["json"])
    secs, ghosts = obj["sections"], obj["ghost_sections"]
    assert row["sections"] == len(secs), f"page {pid}: sections column {row['sections']} != {len(secs)}"
    assert row["ghosts"] == len(ghosts) <= 5, f"page {pid}: ghosts column {row['ghosts']} vs {len(ghosts)}"
    assert [s["no"] for s in secs] == list(range(1, len(secs) + 1)), f"page {pid}: no not 1..n"
    for s in secs:
        h = s["history"]
        assert h["added_year"] <= row["end_year"], f"page {pid} no {s['no']}: added_year > end_year"
        assert h["changes"] >= 0, f"page {pid} no {s['no']}: changes < 0"
        assert h["war_years"] == sorted(h["war_years"]), f"page {pid} no {s['no']}: war_years unsorted"
    for g in ghosts:
        assert set(g) == GHOST_KEYS, f"page {pid}: ghost fields {sorted(g)}"
        assert g["removed_year"] > g["from_year"], f"page {pid}: ghost removed_year <= from_year"
    return obj


def check_pinned(pid: int, obj: dict, before: dict) -> None:
    """B6.3: counts and deep equality with the pre-deploy /api/summary response."""
    n_sec, n_gh = PINNED[pid]
    assert (len(obj["sections"]), len(obj["ghost_sections"])) == (n_sec, n_gh), (
        f"pinned {pid}: {len(obj['sections'])}/{len(obj['ghost_sections'])} != {n_sec}/{n_gh}"
    )
    expected = [{"no": s["no"], "heading": s["heading"], "history": s["history"]} for s in before["sections"]]
    assert obj["sections"] == expected, f"pinned {pid}: sections differ from before file"
    assert obj["ghost_sections"] == before["ghost_sections"], f"pinned {pid}: ghosts differ from before file"


def _refuse_3308(*cons_modules) -> None:
    for mod in cons_modules:
        if int(mod.DB["port"]) == 3308:
            raise RuntimeError("Refusing to connect to 3308; spec 018 targets 3307 only.")


class _Shared:
    """Connection proxy: close() is a no-op and commit() is real only every `every` calls."""

    def __init__(self, con, every: int):
        self._con, self._every, self._n = con, every, 0

    def __getattr__(self, name):
        return getattr(self._con, name)

    def close(self) -> None:
        pass

    def commit(self) -> None:
        self._n += 1
        if self._n % self._every == 0:
            self._con.commit()

    def flush(self) -> None:
        self._con.commit()


def _scalar(cur, sql: str) -> int:
    cur.execute(sql)
    return int(cur.fetchone()[0])


def self_check(rag, svt_open) -> None:
    from backend import summary

    cur = rag.cursor()
    try:
        history_pages = _scalar(cur, HISTORY_PAGES_SQL)
        cur.execute(TODO_SQL)
        todo = len(cur.fetchall())
        rows_n = _scalar(cur, "SELECT COUNT(*) FROM wikihistory.section_history")
        assert rows_n == history_pages, f"rows {rows_n} != history pages {history_pages}"
        assert todo == 0, f"todo query returns {todo} rows"

        cur.execute(ROWS_SQL)
        stats = {"short": 0, "with_ghost": 0, "ghosts": 0, "ms": [], "objs": {}}
        cols = [d[0] for d in cur.description]
        while True:
            batch = cur.fetchmany(500)
            if not batch:
                break
            for tup in batch:
                row = dict(zip(cols, tup))
                obj = check_row(row)
                stats["short"] += row["sections"] == 0
                stats["with_ghost"] += row["ghosts"] > 0
                stats["ghosts"] += row["ghosts"]
                stats["ms"].append(row["build_ms"])
                if row["page_id"] in PINNED or row["sections"] > 0:
                    stats["objs"][row["page_id"]] = obj

        for pid in PINNED:
            with open(BEFORE_FILE.format(pid), encoding="utf-8") as fh:
                check_pinned(pid, stats["objs"][pid], json.load(fh))
        print(f"pinned ok: " + ", ".join(f"{p} {a}/{b}" for p, (a, b) in PINNED.items()))

        rest = sorted(p for p in stats["objs"] if p not in PINNED)
        random.Random(18).shuffle(rest)
        parity_ids = list(PINNED) + rest[:20]
        svt = svt_open()
        try:
            scur = svt.cursor()
            try:
                for pid in parity_ids:
                    cur.execute(summary.ARTICLE_SQL, ("fi", pid))
                    art = dict(zip([d[0] for d in cur.description], cur.fetchone()))
                    found = summary.history.rows(scur, summary.SVT_CURRENT_ROW_SQL, (pid,))
                    again = summary.compute_section_history(art, scur, found[0])
                    assert again == stats["objs"][pid], f"parity: page {pid} differs from the old SVT path"
            finally:
                scur.close()
        finally:
            svt.close()
        print(f"parity {len(parity_ids)}/{len(parity_ids)} page_ids={parity_ids}")
        ms = stats["ms"]
        print(
            f"SELF-CHECK PASS rows={rows_n} short={stats['short']} with_ghost={stats['with_ghost']} "
            f"ghosts={stats['ghosts']} build_ms mean={sum(ms) / len(ms):.0f} max={max(ms)}"
        )
    finally:
        cur.close()


def parse_args(argv=None) -> argparse.Namespace:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--pages", default=None, help="comma separated page_ids, rebuilt even if fresh")
    ap.add_argument("--sleep", type=float, default=DEFAULT_SLEEP)
    ap.add_argument("--commit-every", type=int, default=COMMIT_EVERY)
    ap.add_argument("--verify-only", action="store_true")
    return ap.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    from backend import rag_common, summary, svt_common

    _refuse_3308(rag_common, svt_common, summary.svt_common)
    rag = summary._open_rag()  # SET time_zone '+00:00' inside
    summary.ensure_section_history_table(rag)
    if args.verify_only:
        self_check(rag, summary._open_svt)
        return 0

    cur = rag.cursor()
    n_current = _scalar(cur, "SELECT COUNT(*) FROM wikihistory.article")
    n_fi = _scalar(cur, "SELECT COUNT(*) FROM wikirag.article WHERE lang = 'fi'")
    n_history = _scalar(cur, HISTORY_PAGES_SQL)
    cur.execute(TODO_SQL)
    todo_all = [int(r[0]) for r in cur.fetchall()]
    cur.close()
    todo = [int(p) for p in args.pages.split(",")] if args.pages else todo_all
    n_todo_total = len(todo)
    if args.limit is not None:
        todo = todo[: args.limit]
    print(
        f"start wikihistory current pages={n_current} wikirag fi pages={n_fi} history pages={n_history} "
        f"fresh={n_history - len(todo_all)} todo={len(todo_all)} this_run={len(todo)} sleep={args.sleep}",
        flush=True,
    )

    shared_rag = _Shared(rag, args.commit_every)
    svt_con = summary._open_svt()
    svt_con.autocommit = True  # read-only; avoid one giant snapshot
    shared_svt = _Shared(svt_con, args.commit_every)
    t_start = time.monotonic()
    durations: list[float] = []
    sum_sections = sum_ghosts = errors = 0
    for i, pid in enumerate(todo, 1):
        t0 = time.monotonic()
        try:
            result = summary.build_section_history_row(pid, lambda: shared_rag, lambda: shared_svt)
            if result is None:
                raise LookupError("no wikirag fi article or no current wikihistory row")
            sum_sections += len(result["sections"])
            sum_ghosts += len(result["ghost_sections"])
        except Exception as exc:  # noqa: BLE001 - log and continue, exit code 1 at the end
            errors += 1
            print(f"error page_id={pid} {type(exc).__name__}: {exc}", flush=True)
        durations.append(time.monotonic() - t0)
        if i % 50 == 0:
            rate = i / (time.monotonic() - t_start)
            print(
                f"progress {i}/{len(todo)} rate={rate:.2f} eta={(len(todo) - i) / rate / 3600:.2f}h "
                f"sections={sum_sections} ghosts={sum_ghosts} errors={errors}",
                flush=True,
            )
        time.sleep(args.sleep)
    shared_rag.flush()
    wall = time.monotonic() - t_start

    if args.limit is not None and durations:
        mean = statistics.fmean(durations) + args.sleep
        p95 = sorted(durations)[max(0, int(len(durations) * 0.95) - 1)] + args.sleep
        print(
            f"estimate: mean={mean:.2f}s p95={p95:.2f}s/page -> {mean * n_todo_total / 3600:.2f} h "
            f"for {n_todo_total} pages",
            flush=True,
        )
    print(
        f"end wall={wall:.0f}s pages={len(todo)} sections={sum_sections} ghosts={sum_ghosts} errors={errors}",
        flush=True,
    )
    if args.limit is None:
        self_check(rag, summary._open_svt)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
