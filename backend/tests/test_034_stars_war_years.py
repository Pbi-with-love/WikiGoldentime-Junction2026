"""Pure test of the stars war_years attach step (no DB)."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
from backend.main import _attach_war_years  # noqa: E402


def test_attach_war_years_fi_only_sorted_omitted_when_empty():
    stars = [
        {"lang": "fi", "page_id": 1, "has_history": True},
        {"lang": "fi", "page_id": 2, "has_history": True},
        {"lang": "sv", "page_id": 1, "has_history": False},
        {"lang": "fi", "page_id": 3, "has_history": False},
    ]
    rows = [(1, "2014-05", 3), (1, "2007-01", 9), (1, "2014-06", 4), (1, "2010-02", 2), (2, "2010-02", 2), (3, "2008-01", 5)]
    _attach_war_years(stars, rows)
    assert stars[0]["war_years"] == [2007, 2014]
    assert "war_years" not in stars[1] and "war_years" not in stars[2] and "war_years" not in stars[3]
