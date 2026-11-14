"""Unit tests for scripts/history_stats.py driving backend.history.versions()."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import os
import sys
import unittest

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPTS_DIR)
for path in (REPO_ROOT, SCRIPTS_DIR):
    if path not in sys.path:
        sys.path.insert(0, path)

from backend import history  # noqa: E402
import history_stats  # noqa: E402


class FakeVersionsCursor:
    """Minimal DB cursor stub matching history.VERSIONS_SQL column metadata."""

    COLUMNS = ("rev_id", "row_start", "user", "comment", "len", "is_revert", "undid_anonymous")

    def __init__(self, rows_by_page: dict[int, list[tuple]]):
        self.rows_by_page = rows_by_page
        self.description = [(col,) for col in self.COLUMNS]
        self._current_rows: list[tuple] = []
        self.executed: list[tuple[str, tuple]] = []

    def execute(self, sql: str, params: tuple = ()) -> None:
        self.executed.append((sql, params))
        assert sql == history.VERSIONS_SQL, f"Unexpected SQL: {sql}"
        page_id = params[0]
        self._current_rows = list(self.rows_by_page.get(page_id, []))

    def fetchall(self) -> list[tuple]:
        return list(self._current_rows)


def _row(
    rev_id: int,
    row_start: datetime,
    user: str | None,
    is_revert: int | None,
    undid_anonymous: int | None,
    comment: str = "",
    length: int = 100,
) -> tuple:
    return (rev_id, row_start, user, comment, length, is_revert, undid_anonymous)


class HistoryStatsUnitTests(unittest.TestCase):
    def test_no_reverts_and_previous_sha1_repeat_not_counted_as_revert(self):
        # Row 3 represents an identical sha1 to the immediately preceding row (VERSIONS_SQL sets is_revert=0).
        cur = FakeVersionsCursor(
            {
                10: [
                    _row(1, datetime(2020, 1, 2, 10, 0, 0), "Alice", None, None),
                    _row(2, datetime(2020, 1, 5, 12, 0, 0), "Bob", 0, 0),
                    _row(3, datetime(2020, 1, 6, 8, 0, 0), "Bob", 0, 0),
                ]
            }
        )
        vers = history.versions(cur, 10)
        self.assertEqual(len(cur.executed), 1)
        self.assertEqual(cur.executed[0][1], (10,))

        hist_row, month_rows = history_stats.summarize_page_versions(10, vers)
        self.assertEqual(hist_row, (10, datetime(2020, 1, 2, 10, 0, 0), 3, 0, 0, 0))
        self.assertEqual(month_rows, [(10, "2020-01", 3, 0, 0)])

    def test_reverts_undoing_ipv4_ipv6_and_temp_account_are_not_disputes(self):
        cur = FakeVersionsCursor(
            {
                20: [
                    _row(1, datetime(2025, 2, 1, 0, 0, 0), "Alice", None, None),
                    _row(2, datetime(2025, 2, 2, 1, 0, 0), "192.0.2.44", 0, 0),
                    _row(3, datetime(2025, 2, 2, 1, 5, 0), "Bob", 1, 1),  # undid IPv4
                    _row(4, datetime(2025, 2, 3, 2, 0, 0), "2001:db8::dead:beef", 0, 0),
                    _row(5, datetime(2025, 2, 3, 2, 10, 0), "Alice", 1, 1),  # undid IPv6
                    _row(6, datetime(2025, 2, 4, 3, 0, 0), "~2026-33532-4", 0, 0),
                    _row(7, datetime(2025, 2, 4, 3, 15, 0), "Bob", 1, 1),  # undid temp account
                ]
            }
        )
        vers = history.versions(cur, 20)
        hist_row, month_rows = history_stats.summarize_page_versions(20, vers)
        self.assertEqual(hist_row, (20, datetime(2025, 2, 1, 0, 0, 0), 7, 3, 0, 0))
        self.assertEqual(month_rows, [(20, "2025-02", 7, 3, 0)])

    def test_named_user_disputes_and_war_month_threshold_sparse_months(self):
        cur = FakeVersionsCursor(
            {
                30: [
                    # 2020-05: 5 edits, 4 reverts (3 disputes + 1 anon cleanup) -> 1 war month
                    _row(1, datetime(2020, 5, 1, 8, 0, 0), "Alice", None, None),
                    _row(2, datetime(2020, 5, 2, 8, 0, 0), "Bob", 1, 0),
                    _row(3, datetime(2020, 5, 3, 8, 0, 0), "Alice", 1, 0),
                    _row(4, datetime(2020, 5, 4, 8, 0, 0), "Bob", 1, 0),
                    _row(5, datetime(2020, 5, 5, 8, 0, 0), "Carol", 1, 1),
                    # 2020-06: 4 edits, 2 disputes (< 3) -> 0 war months
                    _row(6, datetime(2020, 6, 1, 9, 0, 0), "Alice", 0, 0),
                    _row(7, datetime(2020, 6, 2, 9, 0, 0), "Bob", 1, 0),
                    _row(8, datetime(2020, 6, 3, 9, 0, 0), "Alice", 1, 0),
                    _row(9, datetime(2020, 6, 4, 9, 0, 0), "Carol", 0, 0),
                    # 2020-07 omitted (sparse); 2020-08 has 1 edit
                    _row(10, datetime(2020, 8, 10, 12, 0, 0), "Alice", 0, 0),
                ]
            }
        )
        vers = history.versions(cur, 30)
        hist_row, month_rows = history_stats.summarize_page_versions(30, vers)

        self.assertEqual(
            month_rows,
            [
                (30, "2020-05", 5, 4, 3),
                (30, "2020-06", 4, 2, 2),
                (30, "2020-08", 1, 0, 0),
            ],
        )
        self.assertEqual(hist_row, (30, datetime(2020, 5, 1, 8, 0, 0), 10, 6, 5, 1))
        self.assertEqual(hist_row[2], sum(m[2] for m in month_rows))
        self.assertEqual(hist_row[3], sum(m[3] for m in month_rows))
        self.assertEqual(hist_row[4], sum(m[4] for m in month_rows))
        self.assertEqual(hist_row[5], sum(1 for m in month_rows if m[4] >= 3))

    def test_utc_month_boundary_split(self):
        eet = timezone(timedelta(hours=2))
        cur = FakeVersionsCursor(
            {
                40: [
                    _row(1, datetime(2021, 1, 31, 23, 59, 59), "Alice", None, None),
                    _row(2, datetime(2021, 2, 1, 0, 0, 0), "Bob", 0, 0),
                    # 2021-03-01 01:30+02:00 is 2021-02-28 23:30 UTC -> 2021-02
                    _row(3, datetime(2021, 3, 1, 1, 30, 0, tzinfo=eet), "Carol", 0, 0),
                    # 2021-03-01 02:00+02:00 is 2021-03-01 00:00 UTC -> 2021-03
                    _row(4, datetime(2021, 3, 1, 2, 0, 0, tzinfo=eet), "Alice", 0, 0),
                ]
            }
        )
        vers = history.versions(cur, 40)
        hist_row, month_rows = history_stats.summarize_page_versions(40, vers)

        self.assertEqual(hist_row, (40, datetime(2021, 1, 31, 23, 59, 59), 4, 0, 0, 0))
        self.assertEqual(
            month_rows,
            [
                (40, "2021-01", 1, 0, 0),
                (40, "2021-02", 2, 0, 0),
                (40, "2021-03", 1, 0, 0),
            ],
        )

    def test_global_month_totals_match_page_and_month_sums(self):
        cur = FakeVersionsCursor(
            {
                100: [
                    _row(1, datetime(2022, 1, 5, 10, 0, 0), "A", None, None),
                    _row(2, datetime(2022, 1, 6, 10, 0, 0), "B", 1, 0),
                    _row(3, datetime(2022, 2, 1, 10, 0, 0), "C", 1, 1),
                ],
                200: [
                    _row(4, datetime(2022, 1, 7, 10, 0, 0), "D", None, None),
                    _row(5, datetime(2022, 3, 1, 10, 0, 0), "E", 1, 0),
                ],
            }
        )
        global_acc: dict[str, list[int]] = {}
        hist_rows = []
        all_month_rows = []

        for pid in (100, 200):
            h_row, m_rows = history_stats.summarize_page_versions(pid, history.versions(cur, pid))
            hist_rows.append(h_row)
            all_month_rows.extend(m_rows)
            history_stats.accumulate_global_months(global_acc, m_rows)

        global_rows = history_stats.sorted_global_rows(global_acc)
        self.assertEqual(
            global_rows,
            [
                ("2022-01", 3, 1, 1),
                ("2022-02", 1, 1, 0),
                ("2022-03", 1, 1, 1),
            ],
        )
        self.assertEqual(sum(h[2] for h in hist_rows), sum(g[1] for g in global_rows))
        self.assertEqual(sum(h[3] for h in hist_rows), sum(g[2] for g in global_rows))
        self.assertEqual(sum(h[4] for h in hist_rows), sum(g[3] for g in global_rows))
        self.assertEqual(sum(m[2] for m in all_month_rows), sum(g[1] for g in global_rows))

    def test_empty_versions_and_3308_guard(self):
        with self.assertRaises(ValueError):
            history_stats.summarize_page_versions(999, [])
        with self.assertRaises(RuntimeError):
            history_stats.connect_db(port=3308)


if __name__ == "__main__":
    unittest.main()
