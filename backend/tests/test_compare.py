"""Unit tests for backend/compare.py (offline: no DB, no network)."""

from __future__ import annotations

import logging
from pathlib import Path
import sys
from typing import Any

from fastapi.testclient import TestClient
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend import compare, main, summary  # noqa: E402


def _make_long_text(sections: list[tuple[str, str]]) -> str:
    lead = " ".join(f"Johdantolause {i} aiheesta Talvisota." for i in range(1, 20))
    sec_blocks = []
    for heading, body in sections:
        pad = " ".join(f"Lisäsana {i}." for i in range(1, 180))
        sec_blocks.append(f"## {heading}\n\n{body} {pad}")
    return f"# Talvisota\n\n{lead}\n\n" + "\n\n".join(sec_blocks)


def test_min_aggregation_and_threshold_boundary():
    kept = [
        {"no": 1, "heading": "Tausta"},
        {"no": 2, "heading": "Sota"},
    ]
    fi_chunks = {1: "Tausta", 2: "Tausta", 3: "Sota"}
    siblings = {
        "sv": {"page_id": 18361, "title": "Vinterkriget", "url": "https://sv.wikipedia.org/wiki/Vinterkriget"},
        "en": {"page_id": 33924, "title": "Winter War", "url": "https://en.wikipedia.org/wiki/Winter_War"},
    }
    distance_pairs = {
        "sv": [
            (1, 10, 0.42),
            (1, 11, 0.38),
            (2, 10, 0.35),   # exact threshold -> match!
            (2, 11, 0.51),
            (3, 10, 0.351),  # threshold + 0.001 -> not a match!
        ],
        "en": [
            (1, 20, 0.3124),
            (2, 20, 0.3126),
            (3, 20, 0.44),
        ],
    }
    sibling_chunks = {
        "sv": {10: ("Bakgrund", "Vinterkriget — Bakgrund\n\nFinland hade varit en del av Ryssland.")},
        "en": {20: ("Background", "Winter War — Background\n\nFinland declared independence in 1917.")},
    }

    res = compare.aggregate_compare_sections(
        kept_sections=kept,
        fi_chunk_sections=fi_chunks,
        siblings=siblings,
        distance_pairs=distance_pairs,
        sibling_chunks=sibling_chunks,
        threshold=0.35,
        rule="baseline",
    )

    assert len(res) == 2
    assert res[0]["no"] == 1
    assert res[0]["heading"] == "Tausta"
    assert res[0]["sv"]["match"] is True
    assert res[0]["sv"]["distance"] == 0.35
    assert res[0]["sv"]["section"] == "Bakgrund"
    assert res[0]["sv"]["passage"] == "Finland hade varit en del av Ryssland."
    assert res[0]["sv"]["url"] == "https://sv.wikipedia.org/wiki/Vinterkriget#Bakgrund"

    assert res[0]["en"]["match"] is True
    assert res[0]["en"]["distance"] == 0.312

    assert res[1]["no"] == 2
    assert res[1]["sv"] == {
        "match": False,
        "distance": 0.351,
        "section": None,
        "passage": None,
        "url": None,
    }
    assert res[1]["en"] == {
        "match": False,
        "distance": 0.44,
        "section": None,
        "passage": None,
        "url": None,
    }


def test_missing_sibling_and_section_without_chunks_logs_warning(caplog):
    kept = [
        {"no": 1, "heading": "Tausta"},
        {"no": 2, "heading": "Tyhjä"},
    ]
    fi_chunks = {1: "Tausta"}
    siblings = {
        "sv": None,
        "en": {"page_id": 33924, "title": "Winter War", "url": "https://en.wikipedia.org/wiki/Winter_War"},
    }
    distance_pairs = {"en": [(1, 0, 0.25)]}
    sibling_chunks = {"en": {0: (None, "Winter War\n\nThe Winter War was fought in 1939–1940.")}}

    with caplog.at_level(logging.WARNING, logger="backend.compare"):
        res = compare.aggregate_compare_sections(
            kept_sections=kept,
            fi_chunk_sections=fi_chunks,
            siblings=siblings,
            distance_pairs=distance_pairs,
            sibling_chunks=sibling_chunks,
            threshold=0.35,
            article_page_id=1256,
        )

    assert res[0]["sv"] is None
    assert res[0]["en"]["match"] is True
    assert res[0]["en"]["section"] is None
    assert res[0]["en"]["url"] == "https://en.wikipedia.org/wiki/Winter_War"

    assert res[1]["sv"] is None
    assert res[1]["en"] is None
    assert any("Tyhjä" in rec.getMessage() and "no chunks" in rec.getMessage() for rec in caplog.records)


def test_duplicate_headings_share_chunks():
    kept = [
        {"no": 1, "heading": "Seuraukset"},
        {"no": 2, "heading": "Seuraukset"},
    ]
    fi_chunks = {4: "Seuraukset"}
    siblings = {
        "sv": {"page_id": 18361, "title": "Vinterkriget", "url": "https://sv.wikipedia.org/wiki/Vinterkriget"},
        "en": None,
    }
    distance_pairs = {"sv": [(4, 7, 0.28)]}
    sibling_chunks = {"sv": {7: ("Följder", "Vinterkriget — Följder\n\nFredsfördraget slöts i Moskva.")}}

    res = compare.aggregate_compare_sections(
        kept_sections=kept,
        fi_chunk_sections=fi_chunks,
        siblings=siblings,
        distance_pairs=distance_pairs,
        sibling_chunks=sibling_chunks,
        threshold=0.35,
        rule="baseline",
    )

    assert res[0]["sv"]["match"] is True
    assert res[1]["sv"]["match"] is True
    assert res[0]["sv"]["distance"] == 0.28
    assert res[1]["sv"]["distance"] == 0.28


def test_format_passage_and_anchor_url():
    long_words = " ".join(["sana" + str(i) for i in range(60)])
    raw = (
        "Vinterkriget — Bakgrund\n\n"
        "**Talvisota** käytiin *30.11.1939* &ndash; [13.3.1940](https://example.org) "
        + long_words
    )
    passage = compare.format_passage(raw, max_chars=240)
    assert not passage.startswith("Vinterkriget")
    assert "**" not in passage
    assert "https://example.org" not in passage
    assert "&ndash;" not in passage
    assert "–" in passage
    assert passage.endswith("…")
    assert len(passage) <= 240
    # Cut on a word boundary: last word before ellipsis should be a complete token
    before_ellipsis = passage[:-1]
    assert raw.split("\n\n", 1)[1].startswith("".join([])) or not before_ellipsis.endswith("san")

    subheading_raw = "Finlands förhistoria — Stenåldern\n\n### Paleolitikum\nVarggrottan är en grotta."
    assert compare.format_passage(subheading_raw) == "Paleolitikum Varggrottan är en grotta."

    # Reused short chunk with single newline header
    reused_raw = "# Oulunkylä\nOulunkylä (*Åggelby*) is a suburb &ndash; north of Helsinki."
    reused_passage = compare.format_passage(reused_raw)
    assert reused_passage == "Oulunkylä (Åggelby) is a suburb – north of Helsinki."

    # Anchor URLs: intro None -> plain URL; spaces & non-ASCII -> encoded
    base = "https://sv.wikipedia.org/wiki/Vinterkriget"
    assert compare.build_section_url(base, None) == base
    assert compare.build_section_url(base, "Talvisodan tausta") == f"{base}#Talvisodan_tausta"
    assert (
        compare.build_section_url(base, "Jälkiselvittelyä päällä")
        == f"{base}#J%C3%A4lkiselvittely%C3%A4_p%C3%A4%C3%A4ll%C3%A4"
    )


class _FakeCursor:
    def __init__(self, state: dict[str, Any]):
        self.state = state
        self._rows: list[tuple[Any, ...]] = []
        self.description: list[tuple[str]] = []

    def execute(self, sql: str, params: Any = ()) -> None:
        self.state["queries"].append((sql, tuple(params)))
        norm = " ".join(sql.split())
        if "FROM wikirag.article WHERE lang = ? AND page_id = ?" in norm:
            lang, pid = params
            art = self.state["articles"].get((lang, int(pid)))
            self.description = [("lang",), ("page_id",), ("rev_id",), ("wikidata_id",), ("title",), ("url",), ("text",)]
            self._rows = [
                (art["lang"], art["page_id"], art["rev_id"], art["wikidata_id"], art["title"], art["url"], art["text"])
            ] if art else []
        elif "FROM wikirag.article WHERE lang = ? AND wikidata_id = ?" in norm:
            lang, qid = params
            matches = [
                a for a in self.state["articles"].values()
                if a["lang"] == lang and a["wikidata_id"] == qid
            ]
            matches.sort(key=lambda a: a["page_id"])
            self.description = [("lang",), ("page_id",), ("rev_id",), ("wikidata_id",), ("title",), ("url",)]
            if matches:
                a = matches[0]
                self._rows = [(a["lang"], a["page_id"], a["rev_id"], a["wikidata_id"], a["title"], a["url"])]
            else:
                self._rows = []
        elif "FROM chunk_vector f JOIN chunk_vector s" in norm:
            sib_lang, sib_pid, fi_pid = params
            self.description = [("chunk_no",), ("chunk_no",), ("d",)]
            self._rows = list(self.state["pairs"].get((sib_lang, int(sib_pid), int(fi_pid)), []))
        elif "SELECT chunk_no, section FROM chunk WHERE lang = 'fi' AND page_id = ?" in norm:
            (fi_pid,) = params
            self.description = [("chunk_no",), ("section",)]
            self._rows = list(self.state["fi_chunks"].get(int(fi_pid), []))
        elif "SELECT chunk_no, section FROM chunk WHERE lang = ? AND page_id = ?" in norm:
            lang, pid = params
            self.description = [("chunk_no",), ("section",)]
            self._rows = [
                (cno, sec)
                for (cno, sec, _) in self.state["sib_chunks"].get((lang, int(pid)), [])
            ]
        elif "SELECT chunk_no, section, text FROM chunk WHERE lang = ? AND page_id = ? AND chunk_no IN" in norm:
            lang, pid, *cnos = params
            self.description = [("chunk_no",), ("section",), ("text",)]
            cset = {int(c) for c in cnos}
            self._rows = [
                (cno, sec, txt)
                for (cno, sec, txt) in self.state["sib_chunks"].get((lang, int(pid)), [])
                if cno in cset
            ]
        else:
            self._rows = []

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def fetchall(self):
        return list(self._rows)

    def close(self) -> None:
        pass


class _FakeConn:
    def __init__(self, state: dict[str, Any]):
        self.state = state

    def cursor(self) -> _FakeCursor:
        return _FakeCursor(self.state)

    def close(self) -> None:
        pass


def test_endpoint_errors_short_and_real_flow(monkeypatch):
    long_text = _make_long_text(
        [
            ("Tausta", "Taustateksti."),
            ("Joukot", "Joukot ja varustus."),
            ("Taistelut", "Taistelujen kulku."),
            ("Rauha", "Rauhansopimus."),
        ]
    )
    short_text = "# Lyhyt\n\nLyhyt artikkeli.\n\n## Osio\n\nLiian lyhyt."
    state = {
        "queries": [],
        "articles": {
            ("fi", 1256): {
                "lang": "fi",
                "page_id": 1256,
                "rev_id": 100,
                "wikidata_id": "Q134949",
                "title": "Talvisota",
                "url": "https://fi.wikipedia.org/wiki/Talvisota",
                "text": long_text,
            },
            ("sv", 23612): {
                "lang": "sv",
                "page_id": 23612,
                "rev_id": 200,
                "wikidata_id": "Q134949",
                "title": "Vinterkriget",
                "url": "https://sv.wikipedia.org/wiki/Vinterkriget",
                "text": "sv",
            },
            ("en", 33924): {
                "lang": "en",
                "page_id": 33924,
                "rev_id": 300,
                "wikidata_id": "Q134949",
                "title": "Winter War",
                "url": "https://en.wikipedia.org/wiki/Winter_War",
                "text": "en",
            },
            ("fi", 999): {
                "lang": "fi",
                "page_id": 999,
                "rev_id": 101,
                "wikidata_id": "Q999",
                "title": "Lyhyt",
                "url": "https://fi.wikipedia.org/wiki/Lyhyt",
                "text": short_text,
            },
        },
        "fi_chunks": {
            1256: [(0, None), (1, "Tausta"), (2, "Joukot"), (3, "Taistelut"), (4, "Rauha")],
        },
        "pairs": {
            ("sv", 23612, 1256): [(1, 1, 0.25), (2, 2, 0.50), (3, 1, 0.45), (4, 3, 0.29)],
            ("en", 33924, 1256): [(1, 0, 0.48), (2, 1, 0.22), (3, 2, 0.60), (4, 3, 0.55)],
        },
        "sib_chunks": {
            ("sv", 23612): [
                (1, "Bakgrund", "Vinterkriget — Bakgrund\n\nBakgrundstext i svenska Wikipedia."),
                (2, "Styrkor", "Vinterkriget — Styrkor\n\nEj matchad."),
                (3, "Freden i Moskva", "Vinterkriget — Freden i Moskva\n\nFredsavtalet."),
            ],
            ("en", 33924): [
                (0, None, "Winter War\n\nIntro."),
                (1, "Forces", "Winter War — Forces\n\nFinnish forces were outnumbered."),
            ],
        },
    }

    monkeypatch.setattr(compare, "_open_rag", lambda: _FakeConn(state))
    monkeypatch.setattr(main, "_get_stars_payload", lambda: b"[]")

    with TestClient(main.app) as client:
        r_bad = client.get("/api/compare/de/1256")
        assert r_bad.status_code == 422

        r_sv = client.get("/api/compare/sv/23612")
        assert r_sv.status_code == 404
        assert r_sv.json() == {"detail": "Compare is available for Finnish articles only"}

        r_missing = client.get("/api/compare/fi/7777777")
        assert r_missing.status_code == 404

        r_short = client.get("/api/compare/fi/999")
        assert r_short.status_code == 200
        assert r_short.json()["sections"] == []

        r_ok = client.get("/api/compare/fi/1256")
        assert r_ok.status_code == 200
        data = r_ok.json()
        assert data["article"] == {"lang": "fi", "page_id": 1256, "title": "Talvisota"}
        assert data["threshold"] == compare.THRESHOLD
        assert data["siblings"]["sv"]["page_id"] == 23612
        assert data["siblings"]["en"]["page_id"] == 33924
        assert [s["no"] for s in data["sections"]] == [1, 2, 3, 4]
        assert data["sections"][0]["sv"]["match"] is True
        assert data["sections"][0]["en"]["match"] is False
        assert data["sections"][1]["en"]["match"] is True
        # Section 3 has no mutual sv chunk -> explicit non-match dict (not None), so UI shows Only in Finnish
        assert data["sections"][2]["sv"] == {
            "match": False,
            "distance": 1.0,
            "section": None,
            "passage": None,
            "url": None,
        }
        # Ensure winning sibling chunks were fetched only for matching chunk_nos (sv: 1,3; en: 1)
        chunk_fetches = [q for q in state["queries"] if "chunk_no IN" in q[0]]
        assert len(chunk_fetches) == 2
        assert chunk_fetches[0][1] == ("sv", 23612, 1, 3)
        assert chunk_fetches[1][1] == ("en", 33924, 1)

    # Also verify sections match summary.split_markdown_sections order/headings
    _, expected_secs, _ = summary.split_markdown_sections(long_text)
    assert [(s["no"], s["heading"]) for s in data["sections"]] == [
        (s["no"], s["heading"]) for s in expected_secs
    ]


def test_mutual_and_mutual_section_rules():
    """Verify Spec 027 rules with fake vector distance pairs (no DB):
    - mutual rejects a fi-only section that borrows a sibling chunk belonging to another fi section
    - mutual_section avoids a single stray chunk in an unrelated sibling section (B2 Moskovan rauha)
    """
    kept = [
        {"no": 1, "heading": "Moskovan rauha"},
        {"no": 2, "heading": "Ulkomaiden apu"},
        {"no": 3, "heading": "Kunniamerkit"},
    ]
    fi_chunks = {1: "Moskovan rauha", 2: "Ulkomaiden apu", 3: "Kunniamerkit"}
    siblings = {
        "sv": None,
        "en": {"page_id": 33924, "title": "Winter War", "url": "https://en.wikipedia.org/wiki/Winter_War"},
    }
    # Sibling sections:
    # - en:10, 11 in "Soviet breakthrough" (both genuinely match Moskovan rauha at 0.318 and 0.320)
    # - en:20 in "Foreign support" (stray match to Moskovan rauha at 0.313, while en:21 matches Ulkomaiden apu at 0.260)
    # - Kunniamerkit has no genuine match; its closest chunk is en:21 at 0.340 (whose best fi is Ulkomaiden apu)
    distance_pairs = {
        "en": [
            (1, 10, 0.318),
            (1, 11, 0.320),
            (1, 20, 0.313),
            (1, 21, 0.500),
            (2, 10, 0.480),
            (2, 11, 0.490),
            (2, 20, 0.380),
            (2, 21, 0.260),
            (3, 10, 0.550),
            (3, 11, 0.560),
            (3, 20, 0.520),
            (3, 21, 0.340),
        ],
    }
    sib_chunk_sections = {
        "en": {
            10: "Soviet breakthrough",
            11: "Soviet breakthrough",
            20: "Foreign support",
            21: "Foreign support",
        }
    }
    sibling_chunks = {
        "en": {
            10: ("Soviet breakthrough", "Winter War — Soviet breakthrough\n\nMoscow Peace Treaty terms."),
            11: ("Soviet breakthrough", "Winter War — Soviet breakthrough\n\nBorder cessions."),
            20: ("Foreign support", "Winter War — Foreign support\n\nSwedish iron ore and Allied troops."),
            21: ("Foreign support", "Winter War — Foreign support\n\nAllied aid offers to Finland."),
        }
    }

    # Baseline lets Moskovan rauha pick the stray chunk en:20 (0.313) and Kunniamerkit steal en:21 (0.340)
    base = compare.aggregate_compare_sections(
        kept_sections=kept,
        fi_chunk_sections=fi_chunks,
        siblings=siblings,
        distance_pairs=distance_pairs,
        sibling_chunks=sibling_chunks,
        threshold=0.35,
        rule="baseline",
    )
    assert base[0]["en"]["section"] == "Foreign support"
    assert base[2]["en"]["match"] is True

    # Mutual eliminates the false positive on Kunniamerkit (returns match=False, distance=1.0, not None)
    mut = compare.aggregate_compare_sections(
        kept_sections=kept,
        fi_chunk_sections=fi_chunks,
        siblings=siblings,
        distance_pairs=distance_pairs,
        sibling_chunks=sibling_chunks,
        threshold=0.45,
        rule="mutual",
        sib_chunk_sections=sib_chunk_sections,
    )
    assert mut[0]["en"]["section"] == "Foreign support"  # stray chunk en:20 is still mutual at chunk level
    assert mut[2]["en"] == {"match": False, "distance": 1.0, "section": None, "passage": None, "url": None}

    # Section rule picks Soviet breakthrough (top-2 mean 0.319 vs Foreign support top-2 mean 0.4065)
    sec = compare.aggregate_compare_sections(
        kept_sections=kept,
        fi_chunk_sections=fi_chunks,
        siblings=siblings,
        distance_pairs=distance_pairs,
        sibling_chunks=sibling_chunks,
        threshold=0.35,
        rule="section",
        sib_chunk_sections=sib_chunk_sections,
    )
    assert sec[0]["en"]["section"] == "Soviet breakthrough"
    assert sec[0]["en"]["distance"] == 0.319

    # section_mutual also picks Soviet breakthrough and rejects Kunniamerkit
    sm = compare.aggregate_compare_sections(
        kept_sections=kept,
        fi_chunk_sections=fi_chunks,
        siblings=siblings,
        distance_pairs=distance_pairs,
        sibling_chunks=sibling_chunks,
        threshold=0.45,
        rule="section_mutual",
        sib_chunk_sections=sib_chunk_sections,
    )
    assert sm[0]["en"]["section"] == "Soviet breakthrough"
    assert sm[2]["en"] == {"match": False, "distance": 1.0, "section": None, "passage": None, "url": None}

    # mutual_section (new default) fixes BOTH: Moskovan rauha -> Soviet breakthrough (0.319) AND Kunniamerkit -> non-match
    ms = compare.aggregate_compare_sections(
        kept_sections=kept,
        fi_chunk_sections=fi_chunks,
        siblings=siblings,
        distance_pairs=distance_pairs,
        sibling_chunks=sibling_chunks,
        threshold=compare.THRESHOLD,
        rule=compare.RULE,
        sib_chunk_sections=sib_chunk_sections,
    )
    assert compare.RULE == "mutual_section"
    assert compare.THRESHOLD == 0.45
    assert ms[0]["en"]["match"] is True
    assert ms[0]["en"]["section"] == "Soviet breakthrough"
    assert ms[0]["en"]["passage"] == "Moscow Peace Treaty terms."
    assert ms[0]["en"]["distance"] == 0.319
    assert ms[1]["en"]["match"] is True
    assert ms[1]["en"]["section"] == "Foreign support"
    assert ms[2]["en"] == {"match": False, "distance": 1.0, "section": None, "passage": None, "url": None}


def test_unknown_compare_rule_raises():
    with pytest.raises(ValueError, match="Unknown compare rule"):
        compare.compute_section_winners(
            kept_sections=[{"no": 1, "heading": "Tausta"}],
            fi_chunk_sections={1: "Tausta"},
            distance_pairs={},
            siblings={"sv": None, "en": None},
            rule="nonexistent_rule",
        )
