#!/usr/bin/env python3
"""Way B spike builder: populate system-versioned wikirag.chunk_vector_hist from snapshot_chunk_vector.

Copies precomputed bge-m3 vectors and chunk texts with real Wikipedia revision intervals using
MariaDB's session-scoped `system_versioning_insert_history = 1` and UTC time zone.
Makes zero calls to any model or inference service.
"""

from __future__ import annotations

import argparse
from datetime import datetime
import os
import re
import sys
import time
from typing import Any


def compute_intervals(
    snapshots: list[tuple[int, datetime]],
    current_row_end: datetime,
) -> list[tuple[int, datetime, datetime]]:
    """Compute contiguous non-overlapping [row_start, row_end) intervals per year for one page.

    Input: list of (year, row_start) pairs for one page, plus the server's current-row row_end.
    Output: sorted list of (year, row_start, row_end) tuples where each interval ends at the next
    snapshot's row_start and the final snapshot ends at current_row_end.
    """
    if not snapshots:
        return []

    ordered = sorted(snapshots, key=lambda item: item[0])
    seen_years: set[int] = set()
    for year, _ in ordered:
        if year in seen_years:
            raise ValueError(f"Duplicate snapshot year {year} for page")
        seen_years.add(year)

    for idx in range(1, len(ordered)):
        prev_year, prev_start = ordered[idx - 1]
        curr_year, curr_start = ordered[idx]
        if curr_start <= prev_start:
            raise ValueError(
                f"Non-increasing row_start between year {prev_year} ({prev_start}) "
                f"and {curr_year} ({curr_start})"
            )

    last_year, last_start = ordered[-1]
    if current_row_end <= last_start:
        raise ValueError(
            f"current_row_end ({current_row_end}) must be greater than last row_start "
            f"({last_start} at year {last_year})"
        )

    intervals: list[tuple[int, datetime, datetime]] = []
    for idx, (year, row_start) in enumerate(ordered):
        row_end = ordered[idx + 1][1] if idx + 1 < len(ordered) else current_row_end
        intervals.append((year, row_start, row_end))
    return intervals


def _assert_valid_page_intervals(
    intervals: list[tuple[int, datetime, datetime]],
    expected_current_end: datetime,
) -> None:
    assert intervals, "expected non-empty intervals"
    for idx, (year, start, end) in enumerate(intervals):
        assert start < end, f"interval {year} must satisfy start < end: {start} >= {end}"
        if idx > 0:
            prev_year, _, prev_end = intervals[idx - 1]
            assert year > prev_year, f"years out of order: {prev_year} -> {year}"
            assert prev_end == start, f"gap/overlap between {prev_year} ({prev_end}) and {year} ({start})"
    assert intervals[-1][2] == expected_current_end, (
        f"last interval must end at current_row_end={expected_current_end}, got {intervals[-1][2]}"
    )


def run_selftest() -> int:
    """Verify interval calculation without any database or network access."""
    current_end = datetime(2106, 2, 7, 6, 28, 15, 999999)

    assert compute_intervals([], current_end) == []

    # Single snapshot -> single open current row.
    single = compute_intervals([(2026, datetime(2026, 9, 26, 9, 54, 5))], current_end)
    assert len(single) == 1
    _assert_valid_page_intervals(single, current_end)

    # Unsorted input across multiple years -> sorted, contiguous, no gaps/overlaps, open tail.
    unsorted_snaps = [
        (2015, datetime(2015, 12, 20, 18, 8, 34)),
        (2003, datetime(2003, 10, 13, 10, 32, 24)),
        (2026, datetime(2026, 9, 26, 9, 54, 5)),
        (2014, datetime(2014, 12, 31, 8, 35, 25)),
    ]
    multi = compute_intervals(unsorted_snaps, current_end)
    assert [row[0] for row in multi] == [2003, 2014, 2015, 2026]
    _assert_valid_page_intervals(multi, current_end)
    assert multi[0][2] == datetime(2014, 12, 31, 8, 35, 25)
    assert multi[1][2] == datetime(2015, 12, 20, 18, 8, 34)
    assert multi[2][2] == datetime(2026, 9, 26, 9, 54, 5)
    assert multi[3][2] == current_end

    # Multiple pages computed independently must all satisfy invariants.
    page_b = compute_intervals(
        [
            (2005, datetime(2005, 6, 1, 12, 0, 0)),
            (2020, datetime(2020, 11, 30, 23, 59, 59)),
        ],
        current_end,
    )
    _assert_valid_page_intervals(page_b, current_end)

    # Duplicate year and non-monotonic timestamps must be rejected.
    for bad_input in (
        [(2010, datetime(2010, 1, 1, 0, 0, 0)), (2010, datetime(2010, 2, 1, 0, 0, 0))],
        [(2010, datetime(2010, 5, 1, 0, 0, 0)), (2011, datetime(2010, 5, 1, 0, 0, 0))],
        [(2010, datetime(2010, 5, 1, 0, 0, 0)), (2011, datetime(2009, 5, 1, 0, 0, 0))],
    ):
        try:
            compute_intervals(bad_input, current_end)
        except ValueError:
            pass
        else:
            raise AssertionError(f"Expected ValueError for {bad_input}")

    print("SELFTEST OK: interval invariants verified across single, multi-year, multi-page, and error cases")
    return 0


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
    cur = con.cursor()
    cur.execute("SET time_zone = '+00:00'")
    cur.execute("SET system_versioning_insert_history = 1")
    cur.close()
    return con


def _inspect_source_types(cur: Any) -> tuple[str, str, str]:
    """Read lang column definition from chunk_vector and row_start/row_end style from wikihistory.article."""
    cur.execute("SHOW CREATE TABLE wikirag.chunk_vector")
    cv_ddl = cur.fetchone()[1]
    lang_match = re.search(r"`lang`\s+([^\n,]+)", cv_ddl)
    lang_def = lang_match.group(1).strip() if lang_match else "char(2) NOT NULL"

    cur.execute("SHOW CREATE TABLE wikihistory.article")
    wh_ddl = cur.fetchone()[1]
    rs_match = re.search(r"`row_start`\s+([^\n,]+)", wh_ddl)
    re_match = re.search(r"`row_end`\s+([^\n,]+)", wh_ddl)
    rs_def = rs_match.group(1).strip() if rs_match else "timestamp(6) GENERATED ALWAYS AS ROW START INVISIBLE"
    re_def = re_match.group(1).strip() if re_match else "timestamp(6) GENERATED ALWAYS AS ROW END INVISIBLE"
    return lang_def, rs_def, re_def


def _build_ddl(lang_def: str, rs_def: str, re_def: str, with_vector_index: bool) -> str:
    idx_clause = ",\n  VECTOR INDEX (embedding) M=16 DISTANCE=cosine" if with_vector_index else ""
    return f"""CREATE TABLE wikirag.chunk_vector_hist (
  lang {lang_def},
  page_id INT UNSIGNED NOT NULL,
  chunk_no SMALLINT UNSIGNED NOT NULL,
  year SMALLINT NOT NULL,
  rev_id INT UNSIGNED NOT NULL,
  section VARCHAR(255) NULL,
  text MEDIUMTEXT NOT NULL,
  model VARCHAR(32) NOT NULL,
  embedding VECTOR(1024) NOT NULL,
  row_start {rs_def},
  row_end {re_def},
  PERIOD FOR SYSTEM_TIME (row_start, row_end),
  PRIMARY KEY (lang, page_id, chunk_no){idx_clause}
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci WITH SYSTEM VERSIONING"""


def _parse_dt(val: Any) -> datetime:
    if isinstance(val, datetime):
        return val.replace(tzinfo=None)
    s = str(val).strip()
    fmt = "%Y-%m-%d %H:%M:%S.%f" if "." in s else "%Y-%m-%d %H:%M:%S"
    return datetime.strptime(s, fmt)


def _fmt_dt(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S.%f")


def _read_current_row_end(cur: Any) -> datetime:
    cur.execute("SELECT DISTINCT row_end FROM wikihistory.article")
    rows = cur.fetchall()
    if len(rows) != 1 or rows[0][0] is None:
        raise RuntimeError(f"Expected single distinct current row_end in wikihistory.article, got {rows}")
    return _parse_dt(rows[0][0])


def _confirm_fi_only(cur: Any) -> None:
    cur.execute("SHOW COLUMNS FROM wikihistory.article_list LIKE 'lang'")
    if cur.fetchone() is not None:
        raise RuntimeError("Unexpected lang column on wikihistory.article_list; stop and ask")
    cur.execute(
        "SELECT COUNT(*), SUM(a.lang IS NOT NULL) "
        "FROM wikihistory.article_list l "
        "LEFT JOIN wikirag.article a ON a.page_id = l.page_id AND a.lang = 'fi'"
    )
    total_list, in_fi = cur.fetchone()
    if int(total_list) != int(in_fi):
        raise RuntimeError(f"Non-fi pages found in wikihistory.article_list: total={total_list}, in_fi={in_fi}")


def _parse_page_args(raw_pages: list[str] | None) -> list[int]:
    if not raw_pages:
        return []
    out: list[int] = []
    for item in raw_pages:
        for part in item.split(","):
            part = part.strip()
            if part:
                out.append(int(part))
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="Build wikirag.chunk_vector_hist from snapshot_chunk_vector")
    parser.add_argument("--selftest", action="store_true", help="Run pure-Python interval tests without DB")
    parser.add_argument("--pages", nargs="+", help="Specific page_id(s) to load (e.g. --pages 1256)")
    parser.add_argument("--all-history", action="store_true", help="Load all 50 pages from snapshot_chunk_vector")
    parser.add_argument("--rebuild", action="store_true", help="Drop and recreate chunk_vector_hist before loading")
    args = parser.parse_args()

    if args.selftest:
        return run_selftest()

    target_pages = _parse_page_args(args.pages)
    if not target_pages and not args.all_history:
        parser.error("Specify --selftest, --pages <id...>, or --all-history")

    import mariadb

    t0 = time.monotonic()
    con = _connect()
    cur = con.cursor()

    try:
        _confirm_fi_only(cur)
        current_row_end = _read_current_row_end(cur)
        print(f"current_row_end (from wikihistory.article): {_fmt_dt(current_row_end)}")

        cur.execute("SHOW TABLES FROM wikirag LIKE 'chunk_vector_hist'")
        table_exists = cur.fetchone() is not None

        if table_exists and not args.rebuild:
            cur.execute("SELECT COUNT(*) FROM wikirag.chunk_vector_hist FOR SYSTEM_TIME ALL")
            existing_rows = int(cur.fetchone()[0])
            if existing_rows > 0:
                print(
                    f"ERROR: wikirag.chunk_vector_hist already has {existing_rows} rows; "
                    "pass --rebuild to drop and recreate it.",
                    file=sys.stderr,
                )
                return 1

        if args.rebuild and table_exists:
            cur.execute("DROP TABLE wikirag.chunk_vector_hist")
            con.commit()
            table_exists = False
            print("Dropped existing wikirag.chunk_vector_hist (--rebuild).")

        index_created_on_create = False
        if not table_exists:
            lang_def, rs_def, re_def = _inspect_source_types(cur)
            ddl_with_idx = _build_ddl(lang_def, rs_def, re_def, with_vector_index=True)
            try:
                cur.execute(ddl_with_idx)
                con.commit()
                index_created_on_create = True
                print("INDEX_CREATE_OK: CREATE TABLE with VECTOR INDEX succeeded.")
            except mariadb.Error as exc:
                print(
                    f"INDEX_CREATE_FAILED: errno={exc.errno} sqlstate={exc.sqlstate} msg={exc}"
                )
                ddl_no_idx = _build_ddl(lang_def, rs_def, re_def, with_vector_index=False)
                cur.execute(ddl_no_idx)
                con.commit()
                print("CREATED_WITHOUT_INDEX: created wikirag.chunk_vector_hist without VECTOR INDEX.")
        else:
            cur.execute("SHOW INDEX FROM wikirag.chunk_vector_hist WHERE Index_type = 'VECTOR'")
            index_created_on_create = cur.fetchone() is not None

        if args.all_history:
            cur.execute("SELECT DISTINCT page_id FROM wikirag.snapshot_chunk_vector ORDER BY page_id")
            page_ids = [int(r[0]) for r in cur.fetchall()]
        else:
            page_ids = target_pages

        insert_sql = (
            "INSERT INTO wikirag.chunk_vector_hist "
            "(lang, page_id, chunk_no, year, rev_id, section, text, model, embedding, row_start, row_end) "
            "SELECT 'fi', page_id, chunk_no, year, rev_id, section, text, model, embedding, ?, ? "
            "FROM wikirag.snapshot_chunk_vector "
            "WHERE page_id = ? AND year = ?"
        )

        total_inserted = 0
        expected_current = 0
        expected_history = 0

        for pid in page_ids:
            cur.execute(
                "SELECT DISTINCT year, row_start "
                "FROM wikirag.snapshot_chunk_vector "
                "WHERE page_id = ? ORDER BY year",
                (pid,),
            )
            snaps = [(int(yr), _parse_dt(rs)) for yr, rs in cur.fetchall()]
            if not snaps:
                raise RuntimeError(f"page_id={pid} has no rows in wikirag.snapshot_chunk_vector")

            intervals = compute_intervals(snaps, current_row_end)
            page_total = 0
            page_current = 0
            page_history = 0

            for idx, (year, r_start, r_end) in enumerate(intervals):
                cur.execute(insert_sql, (_fmt_dt(r_start), _fmt_dt(r_end), pid, year))
                n_ins = int(cur.rowcount)
                page_total += n_ins
                is_current = idx == len(intervals) - 1
                if is_current:
                    page_current += n_ins
                else:
                    page_history += n_ins
                print(
                    f"  page={pid} year={year} row_start={_fmt_dt(r_start)} "
                    f"row_end={_fmt_dt(r_end)} rows={n_ins} current={is_current}"
                )

            con.commit()
            total_inserted += page_total
            expected_current += page_current
            expected_history += page_history
            print(
                f"PAGE_DONE page={pid} snapshots={len(intervals)} "
                f"total={page_total} current={page_current} history={page_history}"
            )

        if not index_created_on_create:
            try:
                t_idx = time.monotonic()
                cur.execute(
                    "ALTER TABLE wikirag.chunk_vector_hist "
                    "ADD VECTOR INDEX (embedding) M=16 DISTANCE=cosine"
                )
                con.commit()
                print(
                    f"INDEX_ALTER_OK: ALTER TABLE ADD VECTOR INDEX succeeded in "
                    f"{time.monotonic() - t_idx:.3f}s"
                )
            except mariadb.Error as exc:
                print(
                    f"INDEX_ALTER_FAILED: errno={exc.errno} sqlstate={exc.sqlstate} msg={exc}"
                )
        else:
            print("INDEX_ALTER_SKIPPED: VECTOR INDEX was already created by CREATE TABLE.")

        cur.execute("SELECT COUNT(*) FROM wikirag.chunk_vector_hist FOR SYSTEM_TIME ALL")
        db_all = int(cur.fetchone()[0])
        cur.execute("SELECT COUNT(*) FROM wikirag.chunk_vector_hist")
        db_cur = int(cur.fetchone()[0])
        db_hist = db_all - db_cur
        wall = time.monotonic() - t0
        print(
            f"BUILD_SUMMARY pages={len(page_ids)} inserted={total_inserted} "
            f"db_all={db_all} db_current={db_cur} db_history={db_hist} "
            f"expected_current={expected_current} expected_history={expected_history} "
            f"wall_s={wall:.3f}"
        )
        return 0
    finally:
        cur.close()
        con.close()


if __name__ == "__main__":
    raise SystemExit(main())
