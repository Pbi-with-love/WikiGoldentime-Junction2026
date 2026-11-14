"""Integration tests for the FastAPI core backend against the live MariaDB + Ollama VPS stack."""

from __future__ import annotations

import os
import re
import sys

from fastapi.testclient import TestClient

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from backend.main import app  # noqa: E402

ISO_UTC_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
MONTH_RE = re.compile(r"^\d{4}-\d{2}$")

client = TestClient(app)


def _assert_contiguous_months(months: list[dict]) -> None:
    assert len(months) > 0
    prev_idx = None
    for item in months:
        assert set(item.keys()) == {"month", "edits", "reverts", "disputes"}
        assert MONTH_RE.match(item["month"])
        assert isinstance(item["edits"], int) and item["edits"] >= 0
        assert isinstance(item["reverts"], int) and item["reverts"] >= 0
        assert isinstance(item["disputes"], int) and item["disputes"] >= 0
        y, m = map(int, item["month"].split("-"))
        idx = y * 12 + (m - 1)
        if prev_idx is not None:
            assert idx == prev_idx + 1, f"Month gap detected before {item['month']}"
        prev_idx = idx


def test_stars_shape_counts_and_gzip():
    resp = client.get("/api/stars", headers={"Accept-Encoding": "gzip"})
    assert resp.status_code == 200
    assert resp.headers.get("content-encoding") == "gzip"
    stars = resp.json()
    assert len(stars) == 29460

    counts = {"fi": 0, "sv": 0, "en": 0}
    hist_count = 0
    talvisota = None
    expected_keys = {
        "lang",
        "page_id",
        "wikidata_id",
        "title",
        "url",
        "length",
        "category",
        "x",
        "y",
        "z",
        "has_history",
        "first_edit_year",
        "event_year",
        "lat",
        "lon",
    }

    for row in stars:
        assert set(row.keys()) == expected_keys
        counts[row["lang"]] += 1
        assert isinstance(row["has_history"], bool)
        if row["has_history"]:
            hist_count += 1
            assert row["lang"] == "fi"
            assert isinstance(row["first_edit_year"], int)
        else:
            assert row["first_edit_year"] is None
        assert row["lat"] is None and row["lon"] is None
        if row["lang"] == "fi" and row["page_id"] == 1256:
            talvisota = row

    assert counts == {"fi": 19285, "sv": 4921, "en": 5254}
    assert hist_count == 50
    assert talvisota is not None
    assert talvisota["title"] == "Talvisota"
    assert talvisota["length"] == 78984
    assert talvisota["event_year"] == 1939


def test_search_shape_empty_clamp_and_validation():
    empty = client.get("/api/search", params={"q": "   ", "lang": "", "limit": 10})
    assert empty.status_code == 200
    assert empty.json() == {"rows": [], "also": {}}

    bad_lang = client.get("/api/search", params={"q": "Talvisota", "lang": "de"})
    assert bad_lang.status_code == 422

    resp = client.get("/api/search", params={"q": "Talvisota", "lang": "", "limit": 10})
    assert resp.status_code == 200
    data = resp.json()
    assert set(data.keys()) == {"rows", "also"}
    assert 1 <= len(data["rows"]) <= 10

    first = data["rows"][0]
    assert set(first.keys()) == {"lang", "page_id", "wikidata_id", "title", "url", "distance"}
    assert isinstance(first["distance"], float)
    assert "[mock]" not in first["title"]
    assert len(data["also"]["Q134949"]) == 2
    for sib in data["also"]["Q134949"]:
        assert len(sib) == 3

    clamped_low = client.get("/api/search", params={"q": "Talvisota", "limit": 0})
    assert clamped_low.status_code == 200
    assert len(clamped_low.json()["rows"]) == 1

    clamped_high = client.get("/api/search", params={"q": "Talvisota", "limit": 100})
    assert clamped_high.status_code == 200
    assert len(clamped_high.json()["rows"]) == 50


def test_article_shape_and_errors():
    resp = client.get("/api/article/fi/1256")
    assert resp.status_code == 200
    art = resp.json()
    assert set(art.keys()) == {
        "lang",
        "page_id",
        "rev_id",
        "wikidata_id",
        "title",
        "url",
        "date_modified",
        "length",
        "words",
        "reading_minutes",
        "station_count",
        "text",
        "categories",
        "other_languages",
        "has_history",
        "thumb_url",
        "thumb_file",
    }
    assert art["lang"] == "fi"
    assert art["page_id"] == 1256
    assert art["wikidata_id"] == "Q134949"
    assert art["title"] == "Talvisota"
    assert ISO_UTC_RE.match(art["date_modified"])
    assert art["text"].startswith("# Talvisota\n")
    assert "[mock]" not in art["text"]
    assert art["length"] == len(art["text"])
    assert art["words"] > 0 and art["reading_minutes"] >= 1
    assert art["station_count"] >= 1
    assert art["categories"] == sorted(art["categories"]) and len(art["categories"]) > 0
    assert len(art["other_languages"]) == 2
    assert art["has_history"] is True
    assert art["thumb_url"] is None or isinstance(art["thumb_url"], str)
    assert art["thumb_file"] is None or isinstance(art["thumb_file"], str)

    assert client.get("/api/article/de/1256").status_code == 422
    assert client.get("/api/article/fi/999999999").status_code == 404


def test_global_and_article_timelines_with_gap_fill_and_404():
    g_resp = client.get("/api/timeline")
    assert g_resp.status_code == 200
    g_data = g_resp.json()
    assert set(g_data.keys()) == {"months"}
    _assert_contiguous_months(g_data["months"])
    assert sum(m["edits"] for m in g_data["months"]) == 31848
    # Global month_stats is sparse (279 rows), while contiguous 2003-03..2026-09 has 283 months.
    assert len(g_data["months"]) >= 283
    assert any(m["edits"] == 0 for m in g_data["months"])

    a_resp = client.get("/api/timeline/1256")
    assert a_resp.status_code == 200
    a_data = a_resp.json()
    assert set(a_data.keys()) == {"summary", "months"}
    assert a_data["summary"]["versions"] == 2143
    assert a_data["summary"]["reverts"] == 328
    assert a_data["summary"]["disputes"] == 88
    assert a_data["summary"]["war_months"] == 7
    assert ISO_UTC_RE.match(a_data["summary"]["first_edit"])
    _assert_contiguous_months(a_data["months"])
    assert any(m["edits"] == 0 for m in a_data["months"])

    assert client.get("/api/timeline/23612").status_code == 404


def test_asof_normalization_422_and_404():
    full = client.get("/api/asof/1256", params={"at": "2006-06-01 00:00:00"})
    date_only = client.get("/api/asof/1256", params={"at": "2006-06-01"})
    year_only = client.get("/api/asof/1256", params={"at": "2006"})
    year_end = client.get("/api/asof/1256", params={"at": "2006-12-31 23:59:59"})
    current = client.get("/api/asof/1256")

    assert full.status_code == 200
    assert date_only.status_code == 200
    assert year_only.status_code == 200
    assert year_end.status_code == 200
    assert current.status_code == 200

    snap = full.json()
    assert set(snap.keys()) == {"title", "rev_id", "user", "comment", "row_start", "row_end", "blocks"}
    assert snap["rev_id"] == date_only.json()["rev_id"]
    assert year_only.json()["rev_id"] == year_end.json()["rev_id"]
    assert ISO_UTC_RE.match(snap["row_start"])
    assert snap["row_end"] is not None and ISO_UTC_RE.match(snap["row_end"])
    assert current.json()["row_end"] is None
    assert len(snap["blocks"]) > 0
    for tag, txt in snap["blocks"]:
        assert tag in {"h", "li", "p"}
        assert isinstance(txt, str)
        assert "[mock]" not in txt

    for bad in ("", "bogus", "2026-13-01", "2026-02-30", "2026/06/01", "2026-06-01T00:00:00"):
        assert client.get("/api/asof/1256", params={"at": bad}).status_code == 422

    # 52097 (Moskovan rauhansopimus) did not exist in 2003; sv 23612 has no SVT history.
    assert client.get("/api/asof/52097", params={"at": "2003-01-01 00:00:00"}).status_code == 404
    assert client.get("/api/asof/23612", params={"at": "2020-01-01 00:00:00"}).status_code == 404


def test_diff_by_rev_id_and_timestamps():
    r_2006 = client.get("/api/asof/1256", params={"at": "2006-06-01 00:00:00"}).json()["rev_id"]
    r_now = client.get("/api/asof/1256", params={"at": "2026-10-01 00:00:00"}).json()["rev_id"]

    resp = client.get("/api/diff/1256", params={"from": str(r_2006), "to": str(r_now)})
    assert resp.status_code == 200
    parts = resp.json()["parts"]
    assert len(parts) > 0

    edits = [p for p in parts if p["op"] == "edit"]
    assert len(edits) >= 1
    for part in parts:
        if part["op"] == "same":
            assert isinstance(part["count"], int) and part["count"] > 0
        elif part["op"] == "edit":
            assert len(part["words"]) > 0
            for idx, word in enumerate(part["words"]):
                assert word["t"] in {"eq", "del", "ins"}
                assert isinstance(word["text"], str)
                if idx > 0:
                    assert part["words"][idx - 1]["t"] != word["t"]
        elif part["op"] in {"del", "ins"}:
            assert len(part["block"]) == 2
            assert part["block"][0] in {"h", "li", "p"}
            assert isinstance(part["block"][1], str)
        else:
            raise AssertionError(f"Unexpected diff op: {part}")

    by_years = client.get("/api/diff/1256", params={"from": "2006", "to": "2012"})
    assert by_years.status_code == 200
    assert len(by_years.json()["parts"]) > 0

    assert client.get("/api/diff/1256", params={"from": "999999999", "to": str(r_now)}).status_code == 404
    assert client.get("/api/diff/1256", params={"from": "412098", "to": str(r_now)}).status_code == 404
    assert client.get("/api/diff/1256", params={"from": "not-valid", "to": "2026"}).status_code == 422


def test_static_root_serves_index_html():
    resp = client.get("/")
    assert resp.status_code == 200
    assert "text/html" in resp.headers.get("content-type", "")
    assert "<html" in resp.text.lower()
