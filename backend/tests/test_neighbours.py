"""Pure tests for backend/neighbours.py and backend/threads.py (no DB)."""

from __future__ import annotations

from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend import neighbours as nb, threads as th  # noqa: E402


def row(lang, pid, d, wd):
    return (lang, pid, d, wd, f"T{pid}", f"u{pid}")


def test_group_dedupes_by_wikidata_and_keeps_smallest():
    g = nb.group_neighbours([row("fi", 1, .0, "Q1"), row("sv", 5, .1, "Q2"), row("fi", 6, .2, "Q2"),
                             row("en", 7, .3, "Q3")], "Q1")
    assert [x["key"] for x in g] == ["Q2", "Q3"]
    assert g[0]["hit_lang"] == "sv" and g[0]["distance"] == .1


def test_group_null_wikidata_ids_stay_separate_and_seed_dropped():
    g = nb.group_neighbours([row("fi", 1, 0, None), row("fi", 2, .1, None), row("sv", 2, .2, None)], "fi:1")
    assert [x["key"] for x in g] == ["fi:2", "sv:2"]


def test_representative_language():
    s = {"fi": {"page_id": 1}, "sv": {"page_id": 2}, "en": None}
    assert nb.pick_representative(s, "sv") == "sv"
    assert nb.pick_representative(s, "en") == "fi"
    assert nb.pick_representative({"fi": None, "sv": None, "en": {"page_id": 3}}, "sv") == "en"
    assert nb.pick_representative({"fi": None, "sv": None, "en": None}, "fi") is None


def test_war_years():
    assert nb.war_years_from_months([("1939-12", 3), ("1939-11", 5), ("1940-01", 2), ("1944-06", 4)]) == [1939, 1944]


def item(key, year, d, pid=None, lang="fi"):
    pid = pid or abs(hash(key)) % 10000
    return {"key": key, "event_year": year, "distance": d, "lang": lang, "page_id": pid,
            "wikidata_id": key, "title": key, "x": 0, "y": 0, "z": 0, "_lead200": "s",
            "siblings": {"fi": {"page_id": pid}, "sv": None, "en": None}}


def kinds(sel):
    return [(k, i["key"]) for k, i in sel]


def test_select_before_after_semantic():
    items = [item("a", 1900, .1), item("b", 1950, .2), item("c", 1920, .3), item("d", None, .4),
             item("e", 1960, .5), item("f", 1930, .6)]
    sel = th.select_threads(items, 1940)
    assert kinds(sel) == [("before", "a"), ("after", "b"), ("semantic", "c"), ("semantic", "d")]


def test_select_year_none_all_semantic():
    items = [item(k, 1900 + i, i / 10) for i, k in enumerate("abcde")]
    assert [k for k, _ in th.select_threads(items, None)] == ["semantic"] * 4


def test_select_all_older_no_after():
    items = [item(k, 1800 + i, i / 10) for i, k in enumerate("abc")]
    assert [k for k, _ in th.select_threads(items, 1900)] == ["before", "semantic", "semantic"]


def test_exclude_bare_and_lang_prefixed():
    a, b = item("a", 1900, .1, pid=11), item("b", 1900, .2, pid=22)
    bare, pairs = th.parse_exclude("11, sv:22,x,fi:zz")
    assert bare == {11} and pairs == {("sv", 22)}
    assert th.is_excluded(a, bare, pairs) and not th.is_excluded(b, bare, pairs)
    b["siblings"]["sv"] = {"page_id": 22}
    assert th.is_excluded(b, bare, pairs)


def test_reasons_and_shape():
    out = th.build_threads([item("a", 1918, .3), item("b", 1944, .31), item("c", 1930, .31)], 1930,
                           bare={999})
    by = {t["type"]: t for t in out}
    assert by["before"]["reason"] == "← 1918" and by["after"]["reason"] == "1944 →"
    assert all(t["first_year"] is None and t["removed_year"] is None and t["type"] != "ghost" for t in out)
    assert th.reason("semantic", {"distance": .314}, 1) == "≈ 69 %"


def test_lead_text_drops_section_headings():
    from backend import compare
    out = compare.format_passage(nb.lead_text("# Titel\n\n## Tausta\n\nEka lause.\n\n## Muu\n\nToka."), 100)
    assert out == "Eka lause. Toka." and not out.startswith(("#", "Titel"))
