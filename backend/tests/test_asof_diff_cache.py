"""Unit tests for spec 029 in-process LRU cache and pre-warm for /api/asof and /api/diff."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import sys

from fastapi import HTTPException
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend import history, main  # noqa: E402


class _FakeCursor:
    def __init__(self, state: dict):
        self.state = state
        self._one = None

    def execute(self, sql: str, params=()) -> None:
        self.state["queries"].append((sql, params))
        if "FROM wikirag.article" in sql:
            self._one = (self.state.get("today_rev"),) if self.state.get("today_rev") is not None else None
        else:
            self._one = None

    def fetchone(self):
        return self._one

    def close(self) -> None:
        pass


class _FakeConn:
    def __init__(self, state: dict):
        self.state = state

    def cursor(self) -> _FakeCursor:
        return _FakeCursor(self.state)

    def close(self) -> None:
        pass


@pytest.fixture(autouse=True)
def _clear_asof_diff_caches():
    main._get_asof_cached.cache_clear()
    main._get_diff_cached.cache_clear()
    yield
    main._get_asof_cached.cache_clear()
    main._get_diff_cached.cache_clear()


def _make_row(rev_id: int, text: str, user: str = "TestUser", year: int = 2006) -> dict:
    return {
        "title": "Talvisota",
        "rev_id": rev_id,
        "user": user,
        "comment": f"rev {rev_id}",
        "row_start": datetime(year, 12, 29, 10, 0, 0, tzinfo=timezone.utc),
        "row_end": datetime(2106, 2, 7, 6, 28, 15, tzinfo=timezone.utc),
        "text": text,
    }


def test_asof_caches_identical_and_normalized_moment(monkeypatch):
    calls = {"svt_opens": 0}
    row = _make_row(2114325, "== Alku ==\nTalvisota alkoi 1939.", user="Höyhens")

    def fake_open_svt():
        calls["svt_opens"] += 1
        return _FakeConn({"queries": []})

    monkeypatch.setattr(main, "_open_svt", fake_open_svt)
    monkeypatch.setattr(history, "as_of", lambda cur, page_id, moment: row)

    first = main.get_asof(1256, "2006-12-31")
    second = main.get_asof(1256, "2006-12-31")
    third = main.get_asof(1256, "2006-12-31 00:00:00")

    assert calls["svt_opens"] == 1
    assert first == second == third
    assert first["rev_id"] == 2114325
    assert first["user"] == "Höyhens"


def test_asof_none_skips_cache(monkeypatch):
    calls = {"svt_opens": 0}
    row = _make_row(24273471, "Nykyteksti.", year=2026)

    def fake_open_svt():
        calls["svt_opens"] += 1
        return _FakeConn({"queries": []})

    monkeypatch.setattr(main, "_open_svt", fake_open_svt)
    monkeypatch.setattr(history, "as_of", lambda cur, page_id, moment: row)

    first = main.get_asof(1256, None)
    second = main.get_asof(1256, None)

    assert calls["svt_opens"] == 2
    assert first == second


def test_asof_404_and_422_not_cached(monkeypatch):
    calls = {"svt_opens": 0}
    found = {"row": None}

    def fake_open_svt():
        calls["svt_opens"] += 1
        return _FakeConn({"queries": []})

    monkeypatch.setattr(main, "_open_svt", fake_open_svt)
    monkeypatch.setattr(history, "as_of", lambda cur, page_id, moment: found["row"])

    with pytest.raises(HTTPException) as exc1:
        main.get_asof(999999, "2006-12-31")
    assert exc1.value.status_code == 404

    with pytest.raises(HTTPException) as exc2:
        main.get_asof(999999, "2006-12-31")
    assert exc2.value.status_code == 404
    assert calls["svt_opens"] == 2

    # Once a row exists for the same key, a fresh lookup succeeds.
    found["row"] = _make_row(100, "Nyt löytyy.")
    ok = main.get_asof(999999, "2006-12-31")
    assert calls["svt_opens"] == 3
    assert ok["rev_id"] == 100

    with pytest.raises(HTTPException) as exc_bad:
        main.get_asof(1256, "bad-date")
    assert exc_bad.value.status_code == 422
    assert calls["svt_opens"] == 3


def test_diff_caches_after_strip_and_skips_404_and_none(monkeypatch):
    calls = {"svt_opens": 0}
    rows_by_param = {
        "1862876": _make_row(1862876, "Vanha lause."),
        "23500447": _make_row(23500447, "Uusi lause.", year=2026),
    }

    def fake_open_svt():
        calls["svt_opens"] += 1
        return _FakeConn({"queries": []})

    monkeypatch.setattr(main, "_open_svt", fake_open_svt)
    monkeypatch.setattr(
        main,
        "_resolve_diff_side",
        lambda cur, page_id, param: rows_by_param.get(param) if param is not None else rows_by_param["23500447"],
    )

    first = main.get_diff(1256, from_param="1862876", to_param="23500447")
    second = main.get_diff(1256, from_param=" 1862876 ", to_param=" 23500447 ")

    assert calls["svt_opens"] == 1
    assert first == second
    assert first["parts"][0]["op"] == "edit"

    # 404 is not cached
    with pytest.raises(HTTPException) as exc1:
        main.get_diff(1256, from_param="missing", to_param="23500447")
    assert exc1.value.status_code == 404
    with pytest.raises(HTTPException) as exc2:
        main.get_diff(1256, from_param="missing", to_param="23500447")
    assert exc2.value.status_code == 404
    assert calls["svt_opens"] == 3

    # to=None ("now") skips cache
    main.get_diff(1256, from_param="1862876", to_param=None)
    main.get_diff(1256, from_param="1862876", to_param=None)
    assert calls["svt_opens"] == 5


def test_prewarm_fills_talvisota_cache_and_survives_errors(monkeypatch):
    state = {"queries": [], "today_rev": 23500447, "svt_opens": 0}
    rows_by_moment = {
        "2006-12-31 00:00:00": _make_row(2114325, "2006 teksti", user="Höyhens"),
        "2012-12-31 00:00:00": _make_row(12468838, "2012 teksti", year=2012),
        "2026-12-31 00:00:00": _make_row(24273471, "2026 teksti", year=2026),
    }
    rows_by_rev = {
        "1862876": _make_row(1862876, "2006 milestone"),
        "2114325": _make_row(2114325, "2006 teksti", user="Höyhens"),
        "12468838": _make_row(12468838, "2012 teksti", year=2012),
        "24273471": _make_row(24273471, "2026 teksti", year=2026),
        "23500447": _make_row(23500447, "today teksti", year=2026),
    }

    def fake_open_rag():
        return _FakeConn(state)

    def fake_open_svt():
        state["svt_opens"] += 1
        return _FakeConn(state)

    monkeypatch.setattr(main, "_open_rag", fake_open_rag)
    monkeypatch.setattr(main, "_open_svt", fake_open_svt)
    monkeypatch.setattr(history, "as_of", lambda cur, page_id, moment: rows_by_moment.get(moment))
    monkeypatch.setattr(main, "_resolve_diff_side", lambda cur, page_id, param: rows_by_rev.get(param))

    main._prewarm_asof_diff()
    opens_after_prewarm = state["svt_opens"]
    assert opens_after_prewarm == 7  # 3 asof + 4 diffs (2006 card, 2006, 2012, 2026)

    # Subsequent calls hit cache without opening DB connections
    assert main.get_asof(1256, "2006-12-31")["rev_id"] == 2114325
    assert main.get_asof(1256, "2012-12-31")["rev_id"] == 12468838
    assert main.get_asof(1256, "2026-12-31")["rev_id"] == 24273471
    assert main.get_diff(1256, from_param="12468838", to_param="23500447")["parts"]
    assert main.get_diff(1256, from_param="1862876", to_param="23500447")["parts"]
    assert main.get_diff(1256, from_param="2114325", to_param="23500447")["parts"]
    assert main.get_diff(1256, from_param="24273471", to_param="23500447")["parts"]
    assert state["svt_opens"] == opens_after_prewarm

    # Failures during prewarm must be logged and never crash
    main._get_asof_cached.cache_clear()
    main._get_diff_cached.cache_clear()
    monkeypatch.setattr(main, "_open_rag", lambda: (_ for _ in ()).throw(RuntimeError("rag down")))
    monkeypatch.setattr(main, "_open_svt", lambda: (_ for _ in ()).throw(RuntimeError("svt down")))
    main._prewarm_asof_diff()
