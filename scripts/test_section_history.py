"""Unit tests for the scripts/section_history.py self-check helpers (no DB)."""

from __future__ import annotations

import json
import os
import sys
import unittest

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPTS_DIR)
for path in (REPO_ROOT, SCRIPTS_DIR):
    if path not in sys.path:
        sys.path.insert(0, path)

import section_history  # noqa: E402


def _row(**over) -> dict:
    sections = [
        {"no": i, "heading": f"H{i}", "history": {"added_year": 2005, "changes": i, "war_years": [2007, 2008]}}
        for i in (1, 2, 3)
    ]
    ghost = {"after_no": 1, "heading": "G", "from_year": 2007, "removed_year": 2015, "text": "t", "oldid": 9}
    obj = {"sections": sections, "ghost_sections": [ghost]}
    row = {"page_id": 7, "end_year": 2026, "sections": 3, "ghosts": 1, "json": json.dumps(obj)}
    row.update(over)
    return row


class SelfCheckTests(unittest.TestCase):
    def test_good_row_passes(self):
        section_history.check_row(_row())

    def test_sections_count_disagrees_with_json(self):
        with self.assertRaisesRegex(AssertionError, "sections column"):
            section_history.check_row(_row(sections=2))

    def test_non_consecutive_no(self):
        obj = json.loads(_row()["json"])
        obj["sections"][1]["no"] = 5
        with self.assertRaisesRegex(AssertionError, "no not 1..n"):
            section_history.check_row(_row(json=json.dumps(obj)))

    def test_ghost_must_be_removed_after_it_started(self):
        obj = json.loads(_row()["json"])
        obj["ghost_sections"][0]["removed_year"] = 2007
        with self.assertRaisesRegex(AssertionError, "removed_year"):
            section_history.check_row(_row(json=json.dumps(obj)))


if __name__ == "__main__":
    unittest.main()
