"""Pure tests for backend/road.py (no DB)."""

from __future__ import annotations

from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend import road  # noqa: E402


def _make_item(
    key: str,
    year: int | None,
    distance: float,
    *,
    pid: int = 1,
    lang: str = "fi",
    cats: list[str] | None = None,
) -> dict:
    return {
        "key": key,
        "wikidata_id": key if key.startswith("Q") else None,
        "distance": distance,
        "lang": lang,
        "page_id": pid,
        "title": f"Title {key}",
        "url": f"https://{lang}.wikipedia.org/wiki/{key}",
        "x": 0.1,
        "y": 0.2,
        "z": 0.3,
        "event_year": year,
        "lanes": [lang],
        "siblings": {lang: {"page_id": pid, "title": f"Title {key}", "url": f"u/{key}"}},
        "summary_short": "Short lead.",
        "summary_long": "Longer lead.",
        "thumb_url": None,
        "thumb_file": None,
        "image": None,
        "has_history": False,
        "first_added_year": None,
        "changes": None,
        "war_years": [],
        "history_stats": None,
        "categories": sorted(cats or []),
    }


def test_extract_lead_year_stops_at_first_section_heading():
    text_with_no_lead_year = (
        "# Suomi toisessa maailmansodassa\n"
        "Suomi toisessa maailmansodassa käsittelee tapahtumia.\n\n"
        "## Ennen sotaa\n"
        "Suomi oli läpi 1920- ja 1930-luvuilla kamppaillut.\n"
    )
    assert road.extract_lead_year(text_with_no_lead_year) is None

    text_with_lead_year = (
        "# Talvisota\n"
        "Talvisota oli 30. marraskuuta 1939 – 13. maaliskuuta 1940 käyty sota.\n\n"
        "## Tausta\n"
        "Vuonna 1918 tapahtui jotain.\n"
    )
    assert road.extract_lead_year(text_with_lead_year) == 1939
    assert road.extract_lead_year("# Tyhjä\n## Osa\nVuosi 1809.") is None


def test_sort_road_items_dated_seed_tie_and_undated_last():
    items = [
        _make_item("Q3", None, 0.05, pid=3),
        _make_item("Q2", 1939, 0.10, pid=2),
        _make_item("Q1", 1939, 0.00, pid=1),
        _make_item("Q4", 1918, 0.25, pid=4),
        _make_item("Q5", None, 0.30, pid=5),
    ]
    ordered = road.sort_road_items(items, seed_key="Q1")
    assert [it["key"] for it in ordered] == ["Q4", "Q1", "Q2", "Q3", "Q5"]


def test_build_eras_for_0_1_3_13_dated():
    assert road.build_eras([_make_item("Q1", None, 0.1)]) == []

    one = road.build_eras([_make_item("Q1", 1939, 0.0)])
    assert one == [{"from_year": 1939, "to_year": 1939, "label": "1939"}]

    three = road.build_eras([
        _make_item("Q1", 1918, 0.1),
        _make_item("Q2", 1939, 0.0),
        _make_item("Q3", 1944, 0.2),
    ])
    assert len(three) == 3
    assert [e["label"] for e in three] == ["1918", "1939", "1944"]

    thirteen = road.build_eras(
        [_make_item(f"Q{i}", 1800 + i * 10, 0.1) for i in range(13)]
        + [_make_item("Q99", None, 0.2)]
    )
    assert len(thirteen) == 4
    assert thirteen[0] == {"from_year": 1800, "to_year": 1820, "label": "1800–1820"}
    assert thirteen[-1] == {"from_year": 1890, "to_year": 1920, "label": "1890–1920"}


def test_select_road_groups_prefers_direct_then_related_then_other():
    groups = [
        {"key": "Q_other_close", "distance": 0.40},
        {"key": "Q_rel", "distance": 0.43},
        {"key": "Q_direct", "distance": 0.47},
        {"key": "Q_other_far", "distance": 0.41},
    ]
    group_cats = {
        "Q_other_close": {"Elokuvat"},
        "Q_rel": {"Puukkojunkkarit"},
        "Q_direct": {"Rikoshistoria"},
        "Q_other_far": {"Elokuvat"},
    }
    chosen = road.select_road_groups(
        groups,
        group_cats,
        seed_cats={"Rikoshistoria"},
        related_cats={"Rikoshistoria", "Puukkojunkkarit"},
        limit=3,
    )
    assert [g["key"] for g in chosen] == ["Q_direct", "Q_rel", "Q_other_close"]


def test_build_road_events_seed_once_no_dup_wikidata_and_why_fields():
    items = [
        _make_item("Q1", 1939, 0.0, pid=1, cats=["Talvisota"]),
        _make_item("Q2", 1940, 0.209, pid=2, cats=["Zeta", "Talvisota"]),
        _make_item("Q3", 1941, 0.162, pid=3, cats=["Jatkosota"]),
        _make_item("Q4", None, 0.258, pid=4, cats=["Talvisota"]),
    ]
    ordered = road.sort_road_items(items, seed_key="Q1")
    events = road.build_road_events(ordered, seed_key="Q1", seed_cats={"Talvisota"})

    seeds = [ev for ev in events if ev["why"]["kind"] == "seed"]
    assert len(seeds) == 1 and seeds[0]["page_id"] == 1
    assert [ev["wikidata_id"] for ev in events] == ["Q1", "Q2", "Q3", "Q4"]
    assert events[0]["why"] == {"kind": "seed", "similarity": None, "category": None}
    assert events[1]["why"] == {"kind": "similar", "similarity": 0.79, "category": "Talvisota"}
    assert events[2]["why"] == {"kind": "similar", "similarity": 0.84, "category": None}
    assert events[3]["event_label"] == ""

    cat_events = road.build_road_events(ordered, category="Suomen suuriruhtinaskunta")
    assert all(ev["why"] == {"kind": "category", "similarity": None, "category": "Suomen suuriruhtinaskunta"} for ev in cat_events)


class _FakeCur:
    def __init__(self, rows):
        self.rows, self.calls = rows, []

    def execute(self, sql, params=()):
        self.calls.append((sql, params))

    def fetchall(self):
        return self.rows


def test_attach_sibling_leads_one_query_own_lang_copied():
    items = [
        {
            "lang": "fi", "summary_short": "FI short", "summary_long": "FI long",
            "siblings": {"fi": {"page_id": 1}, "sv": None, "en": {"page_id": 9}},
        },
        {"lang": "fi", "summary_short": "x", "summary_long": "y",
         "siblings": {"fi": {"page_id": 2}, "sv": None, "en": None}},
    ]
    cur = _FakeCur([("en", 9, "# Independence\n\nFinland declared independence.\n## History")])
    road._attach_sibling_leads(cur, items)
    assert len(cur.calls) == 1 and cur.calls[0][1] == ("en", 9)
    s = items[0]["siblings"]
    assert (s["fi"]["summary_short"], s["fi"]["summary_long"]) == ("FI short", "FI long")
    assert s["en"]["summary_short"] == "Finland declared independence."
    assert s["sv"] is None and items[1]["siblings"]["en"] is None
    assert items[1]["siblings"]["fi"]["summary_short"] == "x"
