#!/usr/bin/env python3
"""Precompute per-article and per-month Wikipedia edit-history stats on 3307.

Populates three tables in `wikihistory` on MariaDB 3307 from `article FOR SYSTEM_TIME ALL`
by calling the organizers' `backend.history.versions()` per page_id and atomically swapping
staging tables (`*_new` -> live):
  - `history_stats(page_id PK, first_edit, versions, reverts, disputes, war_months)`
  - `month_stats(page_id, month, edits, reverts, disputes)` (sparse: edits >= 1)
  - `global_month_stats(month PK, edits, reverts, disputes)`

Full-M rerun (after loading all ~19,750 articles into 3308):
  1) Rerun the spec-002 merge + verify into 3307:
     tmux new -d -s merge 'bash ~/wikimemory/db_merge.sh merge > ~/wikimemory/merge.log 2>&1 && bash ~/wikimemory/db_merge.sh verify >> ~/wikimemory/merge.log 2>&1'
  2) Wait for merge to finish, then rerun this script in tmux:
     tmux new -d -s hstats 'cd ~/wikimemory && nice -n 10 /usr/bin/time -v .venv/bin/python scripts/history_stats.py > hstats.log 2>&1'
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import os
import sys
import time

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from backend import history  # noqa: E402

WAR_DISPUTE_THRESHOLD = 3
COMMIT_EVERY_PAGES = 100
BASE_TABLES = ("history_stats", "month_stats", "global_month_stats")

CREATE_STATEMENTS = (
    """
    CREATE TABLE history_stats_new (
      page_id INT(10) UNSIGNED NOT NULL,
      first_edit DATETIME NOT NULL,
      versions INT UNSIGNED NOT NULL,
      reverts INT UNSIGNED NOT NULL,
      disputes INT UNSIGNED NOT NULL,
      war_months INT UNSIGNED NOT NULL,
      PRIMARY KEY (page_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci
    """,
    """
    CREATE TABLE month_stats_new (
      page_id INT(10) UNSIGNED NOT NULL,
      month CHAR(7) NOT NULL,
      edits INT UNSIGNED NOT NULL,
      reverts INT UNSIGNED NOT NULL,
      disputes INT UNSIGNED NOT NULL,
      PRIMARY KEY (page_id, month)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci
    """,
    """
    CREATE TABLE global_month_stats_new (
      month CHAR(7) NOT NULL,
      edits INT UNSIGNED NOT NULL,
      reverts INT UNSIGNED NOT NULL,
      disputes INT UNSIGNED NOT NULL,
      PRIMARY KEY (month)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci
    """,
)


def _to_utc_naive(ts: datetime) -> datetime:
    """Normalize a datetime (naive UTC from session or tz-aware) to naive UTC."""
    if ts.tzinfo is not None:
        return ts.astimezone(timezone.utc).replace(tzinfo=None)
    return ts


def summarize_page_versions(
    page_id: int, vers: list[dict]
) -> tuple[tuple[int, datetime, int, int, int, int], list[tuple[int, str, int, int, int]]]:
    """Group one page's `history.versions()` output by UTC YYYY-MM and compute page totals."""
    if not vers:
        raise ValueError(f"page_id={page_id} returned 0 versions")

    monthly: dict[str, list[int]] = {}
    first_edit: datetime | None = None

    for ver in vers:
        ts = _to_utc_naive(ver["row_start"])
        if first_edit is None or ts < first_edit:
            first_edit = ts

        month = ts.strftime("%Y-%m")
        counts = monthly.get(month)
        if counts is None:
            counts = [0, 0, 0]
            monthly[month] = counts

        counts[0] += 1
        if bool(ver.get("is_revert")):
            counts[1] += 1
            if not bool(ver.get("undid_anonymous")):
                counts[2] += 1

    month_rows = [
        (page_id, month, counts[0], counts[1], counts[2])
        for month, counts in sorted(monthly.items())
    ]

    versions = sum(row[2] for row in month_rows)
    reverts = sum(row[3] for row in month_rows)
    disputes = sum(row[4] for row in month_rows)
    war_months = sum(1 for row in month_rows if row[4] >= WAR_DISPUTE_THRESHOLD)

    assert versions == len(vers), f"page_id={page_id}: sum(edits)={versions} != len={len(vers)}"
    assert disputes <= reverts < versions, (
        f"page_id={page_id}: invariant violated disputes={disputes}, reverts={reverts}, versions={versions}"
    )

    assert first_edit is not None
    history_row = (
        page_id,
        first_edit.replace(microsecond=0),
        versions,
        reverts,
        disputes,
        war_months,
    )
    return history_row, month_rows


def accumulate_global_months(
    global_months: dict[str, list[int]],
    month_rows: list[tuple[int, str, int, int, int]],
) -> None:
    """Fold one page's sparse month_stats rows into the global month accumulator."""
    for _, month, edits, reverts, disputes in month_rows:
        counts = global_months.get(month)
        if counts is None:
            global_months[month] = [edits, reverts, disputes]
        else:
            counts[0] += edits
            counts[1] += reverts
            counts[2] += disputes


def sorted_global_rows(global_months: dict[str, list[int]]) -> list[tuple[str, int, int, int]]:
    """Return global_month_stats rows sorted ascending by YYYY-MM."""
    return [
        (month, counts[0], counts[1], counts[2])
        for month, counts in sorted(global_months.items())
    ]


def connect_db(
    host: str | None = None,
    port: int | None = None,
    user: str | None = None,
    password: str | None = None,
    database: str | None = None,
):
    """Connect via svt_common.connect() targeting 3307 and enforce UTC session time_zone."""
    if port == 3308:
        raise RuntimeError("Refusing to connect to 3308; spec 005 targets wikihistory on 3307 only.")

    overrides = {
        "DB_HOST": host,
        "DB_PORT": str(port) if port is not None else None,
        "DB_USER": user,
        "DB_PASSWORD": password,
        "DB_NAME": database,
    }
    for key, val in overrides.items():
        if val is not None:
            os.environ[key] = val
    os.environ.setdefault("DB_PORT", "3307")

    from backend import svt_common

    if host is not None:
        svt_common.DB["host"] = host
    if port is not None:
        svt_common.DB["port"] = port
    if user is not None:
        svt_common.DB["user"] = user
    if password is not None:
        svt_common.DB["password"] = password
    if database is not None:
        svt_common.DB["database"] = database

    if int(svt_common.DB["port"]) == 3308:
        raise RuntimeError("Refusing to connect to 3308; spec 005 targets wikihistory on 3307 only.")

    print(
        f"Connecting to {svt_common.DB['host']}:{svt_common.DB['port']}/{svt_common.DB['database']} "
        f"as {svt_common.DB['user']}"
    )
    con = svt_common.connect()
    cur = con.cursor()
    try:
        cur.execute("SET time_zone = '+00:00'")
    finally:
        cur.close()
    return con


def prepare_staging_tables(con) -> None:
    """Drop leftover staging/old tables and create fresh *_new staging tables."""
    cur = con.cursor()
    try:
        leftovers = [f"{name}_{suffix}" for suffix in ("new", "old") for name in BASE_TABLES]
        cur.execute(f"DROP TABLE IF EXISTS {', '.join(leftovers)}")
        for ddl in CREATE_STATEMENTS:
            cur.execute(ddl)
        con.commit()
    finally:
        cur.close()


def populate_staging(con, commit_every: int = COMMIT_EVERY_PAGES) -> tuple[int, int]:
    """Stream page_ids, compute stats one page at a time via history.versions(), insert *_new."""
    cur = con.cursor()
    try:
        cur.execute("SELECT DISTINCT page_id FROM article FOR SYSTEM_TIME ALL ORDER BY page_id")
        page_ids = [int(row[0]) for row in cur.fetchall()]
        total_pages = len(page_ids)
        assert total_pages > 0, "wikihistory.article FOR SYSTEM_TIME ALL has 0 pages"

        insert_hist_sql = (
            "INSERT INTO history_stats_new "
            "(page_id, first_edit, versions, reverts, disputes, war_months) "
            "VALUES (?, ?, ?, ?, ?, ?)"
        )
        insert_month_sql = (
            "INSERT INTO month_stats_new "
            "(page_id, month, edits, reverts, disputes) "
            "VALUES (?, ?, ?, ?, ?)"
        )
        insert_global_sql = (
            "INSERT INTO global_month_stats_new "
            "(month, edits, reverts, disputes) "
            "VALUES (?, ?, ?, ?)"
        )

        global_months: dict[str, list[int]] = {}
        total_versions = 0
        t0 = time.monotonic()

        for idx, page_id in enumerate(page_ids, start=1):
            vers = history.versions(cur, page_id)
            hist_row, month_rows = summarize_page_versions(page_id, vers)

            cur.execute(insert_hist_sql, hist_row)
            cur.executemany(insert_month_sql, month_rows)

            accumulate_global_months(global_months, month_rows)
            total_versions += hist_row[2]

            if idx % commit_every == 0 or idx == total_pages:
                con.commit()
                elapsed = max(time.monotonic() - t0, 1e-6)
                rate = total_versions / elapsed
                print(
                    f"Progress: {idx}/{total_pages} pages, "
                    f"{total_versions} versions, {rate:.1f} versions/s, elapsed={elapsed:.2f}s"
                )

        global_rows = sorted_global_rows(global_months)
        cur.executemany(insert_global_sql, global_rows)
        con.commit()
        return total_pages, total_versions
    finally:
        cur.close()


def verify_tables(con, suffix: str) -> None:
    """Run SQL consistency assertions against *_new staging or live tables."""
    hs = f"history_stats{suffix}"
    ms = f"month_stats{suffix}"
    gm = f"global_month_stats{suffix}"
    label = "staging" if suffix else "live"

    cur = con.cursor()
    try:
        cur.execute("SELECT COUNT(*), COUNT(DISTINCT page_id) FROM article FOR SYSTEM_TIME ALL")
        expected_versions, expected_pages = (int(x) for x in cur.fetchone())
        assert expected_pages > 0 and expected_versions > 0, (
            f"Unexpected empty source table: pages={expected_pages}, versions={expected_versions}"
        )

        cur.execute(
            f"SELECT COUNT(*), COALESCE(SUM(versions), 0), COALESCE(SUM(reverts), 0), "
            f"COALESCE(SUM(disputes), 0), COALESCE(SUM(war_months), 0) FROM {hs}"
        )
        hs_pages, hs_versions, hs_reverts, hs_disputes, hs_wars = (int(x) for x in cur.fetchone())
        assert hs_pages == expected_pages, f"{hs}: pages {hs_pages} != {expected_pages}"
        assert hs_versions == expected_versions, f"{hs}: versions {hs_versions} != {expected_versions}"

        cur.execute(
            f"SELECT COUNT(*), COALESCE(SUM(edits), 0), COALESCE(SUM(reverts), 0), "
            f"COALESCE(SUM(disputes), 0), "
            f"COALESCE(SUM(CASE WHEN edits = 0 THEN 1 ELSE 0 END), 0) FROM {ms}"
        )
        ms_rows, ms_edits, ms_reverts, ms_disputes, ms_zero = (int(x) for x in cur.fetchone())
        assert ms_edits == expected_versions, f"{ms}: edits {ms_edits} != {expected_versions}"
        assert ms_reverts == hs_reverts, f"{ms}: reverts {ms_reverts} != {hs_reverts}"
        assert ms_disputes == hs_disputes, f"{ms}: disputes {ms_disputes} != {hs_disputes}"
        assert ms_zero == 0, f"{ms}: found {ms_zero} zero-edit rows (must be sparse)"

        cur.execute(
            f"SELECT COUNT(*), COALESCE(SUM(edits), 0), COALESCE(SUM(reverts), 0), "
            f"COALESCE(SUM(disputes), 0) FROM {gm}"
        )
        gm_rows, gm_edits, gm_reverts, gm_disputes = (int(x) for x in cur.fetchone())
        assert gm_edits == expected_versions, f"{gm}: edits {gm_edits} != {expected_versions}"
        assert gm_reverts == hs_reverts, f"{gm}: reverts {gm_reverts} != {hs_reverts}"
        assert gm_disputes == hs_disputes, f"{gm}: disputes {gm_disputes} != {hs_disputes}"

        cur.execute(
            f"""
            SELECT COUNT(*) FROM {hs} h
            LEFT JOIN (
              SELECT page_id,
                     SUM(edits) AS s_edits,
                     SUM(reverts) AS s_reverts,
                     SUM(disputes) AS s_disputes,
                     SUM(CASE WHEN disputes >= {WAR_DISPUTE_THRESHOLD} THEN 1 ELSE 0 END) AS s_wars
              FROM {ms}
              GROUP BY page_id
            ) m ON m.page_id = h.page_id
            WHERE m.page_id IS NULL
               OR h.versions <> m.s_edits
               OR h.reverts <> m.s_reverts
               OR h.disputes <> m.s_disputes
               OR h.war_months <> m.s_wars
               OR h.disputes > h.reverts
               OR h.reverts >= h.versions
            """
        )
        bad_pages = int(cur.fetchone()[0])
        assert bad_pages == 0, f"{hs} vs {ms}: {bad_pages} inconsistent page rows"

        cur.execute(
            f"SELECT COUNT(*) FROM {ms} m LEFT JOIN {hs} h ON h.page_id = m.page_id WHERE h.page_id IS NULL"
        )
        orphan_ms = int(cur.fetchone()[0])
        assert orphan_ms == 0, f"{ms}: {orphan_ms} orphan page rows"

        cur.execute(
            f"""
            SELECT COUNT(*) FROM {hs} h
            JOIN (
              SELECT page_id,
                     CAST(DATE_FORMAT(MIN(row_start), '%Y-%m-%d %H:%i:%s') AS DATETIME) AS min_rs
              FROM article FOR SYSTEM_TIME ALL
              GROUP BY page_id
            ) a ON a.page_id = h.page_id
            WHERE h.first_edit <> a.min_rs
            """
        )
        bad_first = int(cur.fetchone()[0])
        assert bad_first == 0, f"{hs}: {bad_first} first_edit mismatches vs MIN(row_start)"

        cur.execute(f"SELECT COUNT(DISTINCT month) FROM {ms}")
        distinct_months = int(cur.fetchone()[0])
        assert distinct_months == gm_rows, f"{gm}: rows {gm_rows} != distinct months {distinct_months}"

        cur.execute(
            f"""
            SELECT COUNT(*) FROM (
              SELECT m.month
              FROM (
                SELECT month, SUM(edits) e, SUM(reverts) r, SUM(disputes) d
                FROM {ms}
                GROUP BY month
              ) m
              LEFT JOIN {gm} g ON g.month = m.month
              WHERE g.month IS NULL OR m.e <> g.edits OR m.r <> g.reverts OR m.d <> g.disputes
            ) bad
            """
        )
        bad_global = int(cur.fetchone()[0])
        assert bad_global == 0, f"{gm}: {bad_global} mismatched months vs {ms}"

        con.commit()
        print(
            f"SELF-CHECK PASS ({label}): pages={hs_pages}, versions={hs_versions}, "
            f"reverts={hs_reverts}, disputes={hs_disputes}, war_months={hs_wars}, "
            f"month_rows={ms_rows}, global_months={gm_rows}"
        )
    finally:
        cur.close()


def atomic_swap(con) -> None:
    """Atomically swap *_new tables into live tables and drop any *_old tables."""
    cur = con.cursor()
    try:
        placeholders = ", ".join("?" * len(BASE_TABLES))
        cur.execute(
            f"SELECT table_name FROM information_schema.tables "
            f"WHERE table_schema = DATABASE() AND table_name IN ({placeholders})",
            BASE_TABLES,
        )
        existing = {row[0] for row in cur.fetchall()}

        renames = []
        old_tables = []
        for table in BASE_TABLES:
            if table in existing:
                renames.append(f"{table} TO {table}_old, {table}_new TO {table}")
                old_tables.append(f"{table}_old")
            else:
                renames.append(f"{table}_new TO {table}")

        con.commit()
        cur.execute(f"RENAME TABLE {', '.join(renames)}")
        if old_tables:
            cur.execute(f"DROP TABLE {', '.join(old_tables)}")
        con.commit()
        print(f"Swapped tables atomically (replaced={sorted(existing)})")
    finally:
        cur.close()


def log_sample_articles(con) -> None:
    """Print summary rows for key reference articles if present."""
    cur = con.cursor()
    try:
        cur.execute(
            "SELECT page_id, first_edit, versions, reverts, disputes, war_months "
            "FROM history_stats WHERE page_id IN (1256, 1150, 440) ORDER BY page_id"
        )
        for row in cur.fetchall():
            print(
                f"Sample page_id={row[0]}: first_edit={row[1]} UTC, "
                f"versions={row[2]}, reverts={row[3]}, disputes={row[4]}, war_months={row[5]}"
            )
        con.commit()
    finally:
        cur.close()


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Precompute wikihistory.{history_stats,month_stats,global_month_stats} on 3307."
    )
    parser.add_argument("--db-host", default=None)
    parser.add_argument("--db-port", type=int, default=None)
    parser.add_argument("--db-user", default=None)
    parser.add_argument("--db-password", default=None)
    parser.add_argument("--db-name", default=None)
    parser.add_argument("--commit-every", type=int, default=COMMIT_EVERY_PAGES)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    t_start = time.monotonic()

    con = connect_db(
        host=args.db_host,
        port=args.db_port,
        user=args.db_user,
        password=args.db_password,
        database=args.db_name,
    )
    try:
        prepare_staging_tables(con)
        pages, versions = populate_staging(con, commit_every=args.commit_every)
        verify_tables(con, "_new")
        atomic_swap(con)
        verify_tables(con, "")
        log_sample_articles(con)
    finally:
        con.close()

    print(f"Done: {pages} pages, {versions} versions in {time.monotonic() - t_start:.2f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
