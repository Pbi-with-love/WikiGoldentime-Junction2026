"""Unit tests for backend/summary.py (offline: no network, LLM client & DB faked)."""

from __future__ import annotations

import json
from pathlib import Path
import sys
from types import SimpleNamespace
from typing import Any

from fastapi import BackgroundTasks
from fastapi.testclient import TestClient
import mariadb
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend import main, summary  # noqa: E402


def _make_long_section(heading: str, sentence_prefix: str = "Tämä on testilause") -> str:
    sentences = [f"{sentence_prefix} numero {i} osiossa {heading}." for i in range(1, 10)]
    return f"## {heading}\n\n" + " ".join(sentences)


def _make_long_article(title: str = "Testiartikkeli", num_sections: int = 4) -> str:
    lead = " ".join(
        f"Johtopäätös {i} kertoo aiheesta {title} selkeästi."
        for i in range(1, 18)
    )
    secs = []
    for idx in range(1, num_sections + 1):
        body = " ".join(
            f"Lause {j} käsittelee aihetta {idx} perusteellisesti vuonna {1900 + j}."
            for j in range(1, 75)
        )
        secs.append(f"## Osio {idx}\n\n{body}")
    return f"# {title}\n\n{lead}\n\n" + "\n\n".join(secs)


def test_section_split_drop_list_and_short_sections():
    text = "\n\n".join(
        [
            "# Talvisota",
            "Ensimmäinen johdantolause. Toinen johdantolause.",
            "## Tausta\n\n### Alaluku\n\n"
            + " ".join(["Tämä lause on tarpeeksi pitkä osio."] * 5),
            "## lähteet\n\n" + " ".join(["Lähdeviite numero yksi ja kaksi."] * 10),
            "## See also\n\n" + " ".join(["Another article link item here."] * 10),
            "## Lyhyt\n\nVain muutama sana tässä.",
            _make_long_section("Moskovan rauha"),
        ]
    )
    lead, kept, all_h2 = summary.split_markdown_sections(text)
    assert lead == "Ensimmäinen johdantolause. Toinen johdantolause."
    assert [s["no"] for s in kept] == [1, 2]
    assert [s["heading"] for s in kept] == ["Tausta", "Moskovan rauha"]
    assert "### Alaluku" in kept[0]["text"]
    assert kept[0]["words"] == len(kept[0]["text"].split())
    assert "lähteet" in all_h2
    assert "lyhyt" in all_h2


def test_short_article_rule_and_lead_fallback():
    # Fewer than 1500 words even with 4 kept sections -> short article
    short_many_secs = "\n\n".join(
        [
            "# Lyhyt artikkeli",
            " ".join(["Johdantolause jossa on riittävästi sanoja."] * 10),
            _make_long_section("A"),
            _make_long_section("B"),
            _make_long_section("C"),
            _make_long_section("D"),
        ]
    )
    row = {
        "lang": "fi",
        "page_id": 99,
        "rev_id": 1001,
        "wikidata_id": "Q99",
        "title": "Lyhyt artikkeli",
        "url": "https://fi.wikipedia.org/wiki/Lyhyt",
        "text": short_many_secs,
    }
    payload, _ = summary.build_summary_payload(row, has_history=False, use_llm=False)
    assert payload["sections"] == []
    assert payload["ghost_sections"] == []
    assert payload["mode"] == "extractive"
    assert payload["rev_id"] == 1001

    # >= 1500 words but only 3 kept sections -> short article
    three_secs = _make_long_article("Kolme osiota", num_sections=3)
    assert summary.count_words(three_secs) >= 1500
    row_3 = {**row, "text": three_secs}
    payload_3, _ = summary.build_summary_payload(row_3, has_history=False, use_llm=False)
    assert payload_3["sections"] == []
    assert payload_3["ghost_sections"] == []

    # Short lead (< 40 words) falls back to whole text for tldr
    tiny_lead = "# Pieni\nLyhyt alku.\n\n## Osa\nEnsimmäinen leipätekstilause. Toinen leipätekstilause. Kolmas leipätekstilause."
    row_tiny = {**row, "text": tiny_lead}
    payload_tiny, _ = summary.build_summary_payload(row_tiny, has_history=False, use_llm=False)
    assert "Ensimmäinen leipätekstilause." in payload_tiny["tldr"]


def test_extractive_markdown_stripping_and_finnish_dates():
    sec = (
        "## Talvisota\n"
        "Pääartikkeli: Talvisodan kulku\n\n"
        "### Vaihe 1\n"
        "**Talvisota** käytiin *30. marraskuuta 1939* – 13. maaliskuuta 1940 [Suomen](https://example.com) "
        "ja _Neuvostoliiton_ välillä. Toinen virke kertoo taistelusta. Kolmas virke päättyy. Neljäs ei mahdu."
    )
    one_line, summ = summary.extractive_section_summary(sec)
    assert one_line == (
        "Talvisota käytiin 30. marraskuuta 1939 – 13. maaliskuuta 1940 "
        "Suomen ja Neuvostoliiton välillä."
    )
    assert "Toinen virke kertoo taistelusta." in summ
    assert "Kolmas virke päättyy." in summ
    assert "Neljäs ei mahdu." not in summ


def test_grounding_filter_drops_ungrounded_and_truncates():
    source_text = (
        "## Tausta\n\n"
        "Suomi itsenäistyi 6. joulukuuta 1917. "
        "Talvisota alkoi 30.\u00a0marraskuuta 1939. "
        "Sota kesti 105 päivää. "
        "Moskovan rauha solmittiin maaliskuussa 1940."
    )
    raw_facts = [
        {"label": "Keksitty", "value": "1999", "source": "Tätä lausetta ei ole tekstissä."},
        {"label": "Itsenäisyys", "value": "1917", "source": "Suomi itsenäistyi 6. joulukuuta 1917."},
        {"label": "Alku", "value": "30.11.1939", "source": "Talvisota alkoi 30. marraskuuta 1939."},
        {"label": "Kesto", "value": "105 pv", "source": "Sota kesti 105 päivää."},
        {"label": "Rauha", "value": "1940", "source": "Moskovan rauha solmittiin maaliskuussa 1940."},
    ]
    kept, kept_n, dropped_n = summary.filter_grounded_facts(raw_facts, source_text)
    assert dropped_n == 1
    assert kept_n == 3
    assert len(kept) == 3
    assert [f["label"] for f in kept] == ["Itsenäisyys", "Alku", "Kesto"]
    for fact in kept:
        assert fact["source"] in source_text


class _FakeMessages:
    def __init__(self, handler):
        self._handler = handler
        self.calls: list[dict[str, Any]] = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return self._handler(kwargs)


class _FakeAnthropic:
    def __init__(self, handler):
        self.messages = _FakeMessages(handler)


def _msg_resp(payload: Any, stop_reason: str = "end_turn", in_tok: int = 100, out_tok: int = 50):
    text = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False)
    return SimpleNamespace(
        stop_reason=stop_reason,
        content=[SimpleNamespace(type="text", text=text)],
        usage=SimpleNamespace(input_tokens=in_tok, output_tokens=out_tok),
    )


def test_llm_mode_grounding_and_failure_fallbacks():
    article_text = _make_long_article("Talvisota", num_sections=4)
    row = {
        "lang": "fi",
        "page_id": 1256,
        "rev_id": 23500447,
        "wikidata_id": "Q134949",
        "title": "Talvisota",
        "url": "https://fi.wikipedia.org/wiki/Talvisota",
        "text": article_text,
    }

    def handler(kwargs):
        user_msg = kwargs["messages"][0]["content"]
        schema_req = kwargs["output_config"]["format"]["schema"]["required"]
        assert "thinking" not in kwargs
        assert "temperature" not in kwargs
        assert kwargs["output_config"]["effort"] == "low"

        if "tldr" in schema_req:
            return _msg_resp(
                {
                    "tldr": "LLM yhteenveto. Toinen lause. Kolmas lause.",
                    "facts": [
                        {
                            "label": "Aihe",
                            "value": "Talvisota",
                            "source": "Johtopäätös 1 kertoo aiheesta Talvisota selkeästi.",
                        },
                        {
                            "label": "Hallusinaatio",
                            "value": "X",
                            "source": "Keksitty lähde joka ei ole tekstissä.",
                        },
                    ],
                }
            )
        if "## Osio 1" in user_msg:
            return _msg_resp(
                {
                    "one_line": "Osion 1 tiivistelmä.",
                    "summary": "Osion 1 pidempi tiivistelmä. Toinen lause.",
                    "facts": [
                        {
                            "label": "Lause",
                            "value": "1901",
                            "source": "Lause 1 käsittelee aihetta 1 perusteellisesti vuonna 1901.",
                        }
                    ],
                }
            )
        if "## Osio 2" in user_msg:
            return _msg_resp({}, stop_reason="refusal")
        if "## Osio 3" in user_msg:
            return _msg_resp("{invalid json")
        raise RuntimeError("API transient failure")

    fake_client = _FakeAnthropic(handler)
    payload, stats = summary.build_summary_payload(
        row,
        has_history=False,
        use_llm=True,
        llm_client=fake_client,
        max_workers=2,
    )
    assert payload["mode"] == "llm"
    assert payload["tldr"] == "LLM yhteenveto. Toinen lause. Kolmas lause."
    assert len(payload["facts"]) == 1
    assert payload["sections"][0]["one_line"] == "Osion 1 tiivistelmä."
    assert len(payload["sections"][0]["facts"]) == 1
    # Sections 2, 3, 4 fell back to extractive values
    for idx in (1, 2, 3):
        sec = payload["sections"][idx]
        assert sec["facts"] == []
        assert sec["one_line"].startswith("Lause 1 käsittelee aihetta")
    assert stats.failed_calls == 3
    assert stats.facts_kept == 2
    assert stats.facts_dropped == 1


def test_history_and_ghosts_on_synthetic_snapshots():
    long_ghost_body = " ".join(f"Sana{i}" for i in range(140))  # > 600 chars
    snapshots = [
        (
            2005,
            100,
            "== Alku ==\nEnsimmäinen teksti.\n\n== Poistettu aikaisin ==\nVanha varhainen luku.\n\n== Viitteet ==\n* Lähde 1",
        ),
        (
            2006,
            200,
            "== Alku ==\nEnsimmäinen teksti.\n\n== Poistettu aikaisin ==\nVanha varhainen luku.\n\n== Pitkä haamu ==\n"
            + long_ghost_body
            + "\n\n== Viitteet ==\n* Lähde 1",
        ),
        (
            2007,
            300,
            "== Alku ==\nMuutettu vuonna 2007.\n\n== Pitkä haamu ==\n"
            + long_ghost_body
            + "\n\n== Keskikohta ==\nKeskiteksti.",
        ),
        (
            2008,
            400,
            "== Alku ==\nMuutettu vuonna 2007.\n\n== Pitkä haamu ==\n"
            + long_ghost_body
            + "\n\n== Keskikohta ==\nKeskiteksti.\n\n== Lyhyt haamu ==\nLyhyt teksti.",
        ),
        (
            2009,
            500,
            "== Alku ==\nMuutettu vuonna 2009.\n\n== Keskikohta ==\nKeskiteksti.",
        ),
    ]
    current_sections = [
        {"no": 1, "heading": "Alku"},
        {"no": 2, "heading": "Keskikohta"},
        {"no": 3, "heading": "Uusi osio"},
    ]
    hist_by_no, ghosts = summary.compute_history_and_ghosts(
        snapshots=snapshots,
        current_sections=current_sections,
        war_years_set={2006, 2008},
        current_year=2026,
    )

    assert hist_by_no[1] == {"added_year": 2005, "changes": 2, "war_years": [2006, 2008]}
    assert hist_by_no[2] == {"added_year": 2007, "changes": 0, "war_years": []}
    assert hist_by_no[3] == {"added_year": 2026, "changes": 0, "war_years": []}

    # Lyhyt haamu (1 snapshot) & Viitteet (drop list) must not appear
    # Both ghosts have after_no == 1; sorted by after_no then from_year (2005 before 2006)
    headings = [g["heading"] for g in ghosts]
    assert headings == ["Poistettu aikaisin", "Pitkä haamu"]

    early = next(g for g in ghosts if g["heading"] == "Poistettu aikaisin")
    assert early["after_no"] == 1
    assert early["from_year"] == 2005
    assert early["removed_year"] == 2007
    assert early["oldid"] == 200

    long_g = next(g for g in ghosts if g["heading"] == "Pitkä haamu")
    assert long_g["after_no"] == 1
    assert long_g["from_year"] == 2006
    assert long_g["removed_year"] == 2009
    assert long_g["oldid"] == 400
    assert len(long_g["text"]) <= 600


def test_ghost_limit_5_longest_lived_then_sorted_by_after_no():
    # Build 7 ghosts with distinct lifespans and positions
    snapshots = [
        (
            2005,
            10,
            "\n\n".join(
                [
                    "== Keep1 ==\nBody.",
                    "== G_2yr_after1 ==\nText A.",
                    "== Keep2 ==\nBody.",
                    "== G_4yr_after2 ==\nText B.",
                    "== G_5yr_after2 ==\nText C.",
                    "== Keep3 ==\nBody.",
                    "== G_3yr_after3 ==\nText D.",
                    "== G_6yr_after3 ==\nText E.",
                    "== G_2yr_after3_short ==\nText F.",
                    "== G_5yr_after0 ==\nText G.",
                ]
            ),
        ),
        (
            2006,
            20,
            "\n\n".join(
                [
                    "== G_5yr_after0 ==\nText G.",
                    "== Keep1 ==\nBody.",
                    "== G_2yr_after1 ==\nText A.",
                    "== Keep2 ==\nBody.",
                    "== G_4yr_after2 ==\nText B.",
                    "== G_5yr_after2 ==\nText C.",
                    "== Keep3 ==\nBody.",
                    "== G_3yr_after3 ==\nText D.",
                    "== G_6yr_after3 ==\nText E.",
                    "== G_2yr_after3_short ==\nText F.",
                ]
            ),
        ),
        (
            2007,
            30,
            "\n\n".join(
                [
                    "== G_5yr_after0 ==\nText G.",
                    "== Keep1 ==\nBody.",
                    "== Keep2 ==\nBody.",
                    "== G_4yr_after2 ==\nText B.",
                    "== G_5yr_after2 ==\nText C.",
                    "== Keep3 ==\nBody.",
                    "== G_3yr_after3 ==\nText D.",
                    "== G_6yr_after3 ==\nText E.",
                ]
            ),
        ),
        (
            2008,
            40,
            "\n\n".join(
                [
                    "== G_5yr_after0 ==\nText G.",
                    "== Keep1 ==\nBody.",
                    "== Keep2 ==\nBody.",
                    "== G_4yr_after2 ==\nText B.",
                    "== G_5yr_after2 ==\nText C.",
                    "== Keep3 ==\nBody.",
                    "== G_6yr_after3 ==\nText E.",
                ]
            ),
        ),
        (
            2009,
            50,
            "\n\n".join(
                [
                    "== G_5yr_after0 ==\nText G.",
                    "== Keep1 ==\nBody.",
                    "== Keep2 ==\nBody.",
                    "== G_5yr_after2 ==\nText C.",
                    "== Keep3 ==\nBody.",
                    "== G_6yr_after3 ==\nText E.",
                ]
            ),
        ),
        (
            2010,
            60,
            "== Keep1 ==\nBody.\n\n== Keep2 ==\nBody.\n\n== Keep3 ==\nBody.\n\n== G_6yr_after3 ==\nText E.",
        ),
        (
            2011,
            70,
            "== Keep1 ==\nBody.\n\n== Keep2 ==\nBody.\n\n== Keep3 ==\nBody.",
        ),
    ]
    current_sections = [
        {"no": 1, "heading": "Keep1"},
        {"no": 2, "heading": "Keep2"},
        {"no": 3, "heading": "Keep3"},
    ]
    _, ghosts = summary.compute_history_and_ghosts(snapshots, current_sections)
    assert len(ghosts) == 5
    # Top 5 longest-lived sorted by after_no: 0, 2, 2, 3, 3
    assert [g["after_no"] for g in ghosts] == sorted(g["after_no"] for g in ghosts)
    assert ghosts[0]["heading"] == "G_5yr_after0"
    assert ghosts[0]["after_no"] == 0
    assert {g["heading"] for g in ghosts} == {
        "G_5yr_after0",
        "G_4yr_after2",
        "G_5yr_after2",
        "G_3yr_after3",
        "G_6yr_after3",
    }


class _FakeCursor:
    def __init__(self, db_state: dict[str, Any]):
        self._db = db_state
        self._rows: list[tuple] = []
        self.description: list[tuple] = []

    def execute(self, sql: str, params: tuple = ()) -> None:
        s = " ".join(sql.split())
        if s.startswith("SET time_zone"):
            self._rows = []
        elif s.startswith("CREATE TABLE IF NOT EXISTS"):
            self._rows = []
        elif "FROM wikirag.article" in s:
            lang, pid = params
            row = self._db["articles"].get((lang, int(pid)))
            self.description = [
                ("lang",),
                ("page_id",),
                ("rev_id",),
                ("wikidata_id",),
                ("title",),
                ("url",),
                ("text",),
            ]
            self._rows = [row] if row is not None else []
        elif "FROM wikirag.summary_cache" in s:
            lang, pid, rev_id, ui = params
            cached = self._db["cache"].get((lang, int(pid), int(rev_id), str(ui)))
            self.description = [("json",)]
            self._rows = [(cached,)] if cached is not None else []
        elif s.startswith("INSERT INTO wikirag.summary_cache"):
            lang, pid, rev_id, ui, payload = params
            self._db["cache"][(lang, int(pid), int(rev_id), str(ui))] = payload
            self._rows = []
        elif "FROM article WHERE page_id = ?" in s:
            (pid,) = params
            svt = self._db["svt_current"].get(int(pid))
            self.description = [
                ("title",),
                ("rev_id",),
                ("user",),
                ("comment",),
                ("text",),
                ("row_start",),
                ("row_end",),
            ]
            self._rows = [svt] if svt is not None else []
        elif "FROM history_stats" in s:
            raise mariadb.ProgrammingError("Table doesn't exist")
        elif "FROM article FOR SYSTEM_TIME ALL" in s:
            (pid,) = params
            first = self._db["svt_first"].get(int(pid))
            self.description = [("row_start",)]
            self._rows = [(first,)] if first is not None else []
        elif "FROM article FOR SYSTEM_TIME AS OF" in s:
            moment, pid = params
            yr = int(str(moment)[:4])
            snap = self._db["svt_snaps"].get((int(pid), yr))
            self.description = [
                ("title",),
                ("rev_id",),
                ("user",),
                ("comment",),
                ("text",),
                ("row_start",),
                ("row_end",),
            ]
            self._rows = [snap] if snap is not None else []
        elif "FROM month_stats" in s:
            raise mariadb.ProgrammingError("month_stats missing")
        else:
            raise AssertionError(f"Unexpected SQL in fake cursor: {s}")

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def fetchall(self):
        return list(self._rows)

    def close(self) -> None:
        pass


class _FakeConn:
    def __init__(self, db_state: dict[str, Any]):
        self._db = db_state

    def cursor(self) -> _FakeCursor:
        return _FakeCursor(self._db)

    def commit(self) -> None:
        pass

    def close(self) -> None:
        pass


def test_cache_miss_returns_extractive_and_singleflight_schedules_once(monkeypatch):
    art_text = _make_long_article("Talvisota", num_sections=4)
    db_state = {
        "articles": {
            (
                "fi",
                1256,
            ): (
                "fi",
                1256,
                23500447,
                "Q134949",
                "Talvisota",
                "https://fi.wikipedia.org/wiki/Talvisota",
                art_text,
            )
        },
        "cache": {},
        "svt_current": {
            1256: ("Talvisota", 24000000, "User", "", "== Osio 1 ==\nTeksti.", "2026-05-01 00:00:00", None)
        },
        "svt_first": {1256: "2025-01-01 00:00:00"},
        "svt_snaps": {
            (1256, 2026): ("Talvisota", 23800000, "User", "", "== Osio 1 ==\nVanha.", "2026-01-01 00:00:00", None)
        },
    }

    monkeypatch.setattr(summary, "_open_rag", lambda: _FakeConn(db_state))
    monkeypatch.setattr(summary, "_open_svt", lambda: _FakeConn(db_state))
    monkeypatch.setattr(summary, "_cache_table_ready", False)
    summary._inflight_jobs.clear()

    scheduled: list[tuple] = []
    monkeypatch.setenv("SUMMARY_LLM", "1")
    # Capture BackgroundTasks.add_task without executing the worker immediately so the job remains in-flight.
    monkeypatch.setattr(BackgroundTasks, "add_task", lambda self, fn, *args: scheduled.append((fn, args)))

    client = TestClient(main.app)

    # 404 on unknown language and unknown article
    assert client.get("/api/summary/de/1256").status_code == 404
    assert client.get("/api/summary/fi/999999").status_code == 404

    # Repeated cache misses schedule exactly one background job and never invoke LLM in handler
    llm_called = False

    def fail_if_called():
        nonlocal llm_called
        llm_called = True
        raise AssertionError("LLM must not be called on request handler miss")

    monkeypatch.setattr(summary, "_default_anthropic_client", fail_if_called)

    r1 = client.get("/api/summary/fi/1256")
    r2 = client.get("/api/summary/fi/1256")
    assert r1.status_code == 200
    assert r2.status_code == 200
    d1 = r1.json()
    assert d1["mode"] == "extractive"
    assert d1["rev_id"] == 23500447
    assert len(d1["sections"]) == 4
    assert d1["sections"][0]["history"]["war_years"] == []
    assert llm_called is False
    assert len(scheduled) == 1
    assert scheduled[0][1][0] == ("fi", 1256, 23500447, "")

    # SUMMARY_LLM=0 disables background job scheduling
    summary._inflight_jobs.clear()
    scheduled.clear()
    monkeypatch.setenv("SUMMARY_LLM", "0")
    r3 = client.get("/api/summary/fi/1256")
    assert r3.status_code == 200
    assert r3.json()["mode"] == "extractive"
    assert r3.json()["out_lang"] == "fi"
    assert len(scheduled) == 0

    # Cache hit returns mode="llm" directly without scheduling background work
    cached_payload = {**d1, "mode": "llm", "tldr": "Cached LLM summary."}
    db_state["cache"][("fi", 1256, 23500447, "")] = json.dumps(cached_payload)
    monkeypatch.setenv("SUMMARY_LLM", "1")
    r4 = client.get("/api/summary/fi/1256")
    assert r4.status_code == 200
    assert r4.json()["mode"] == "llm"
    assert r4.json()["tldr"] == "Cached LLM summary."
    assert len(scheduled) == 0


def test_ui_translation_cache_miss_fallback_validation_and_grounding(monkeypatch):
    art_text = _make_long_article("Talvisota", num_sections=4)
    lead_sentence = "Talvisota alkoi 30. marraskuuta 1939 ja päättyi 13. maaliskuuta 1940."
    art_text_with_fact = art_text.replace("Johtopäätös 1", f"{lead_sentence} Johtopäätös 1", 1)
    db_state = {
        "articles": {
            (
                "fi",
                1256,
            ): (
                "fi",
                1256,
                23500447,
                "Q134949",
                "Talvisota",
                "https://fi.wikipedia.org/wiki/Talvisota",
                art_text_with_fact,
            )
        },
        "cache": {},
        "svt_current": {},
        "svt_first": {},
        "svt_snaps": {},
    }

    monkeypatch.setattr(summary, "_open_rag", lambda: _FakeConn(db_state))
    monkeypatch.setattr(summary, "_open_svt", lambda: _FakeConn(db_state))
    monkeypatch.setattr(summary, "_cache_table_ready", False)
    summary._inflight_jobs.clear()

    scheduled: list[tuple] = []
    monkeypatch.setenv("SUMMARY_LLM", "1")
    monkeypatch.setattr(BackgroundTasks, "add_task", lambda self, fn, *args: scheduled.append((fn, args)))

    client = TestClient(main.app)

    # 1. Invalid ui language -> 422
    assert client.get("/api/summary/fi/1256?ui=de").status_code == 422

    # 2. ui matching article.lang uses '' cache row and schedules '' key
    assert client.get("/api/summary/fi/1256?ui=fi").status_code == 200
    assert len(scheduled) == 1
    assert scheduled[0][1][0] == ("fi", 1256, 23500447, "")

    # 3. Pre-existing legacy '' cache row (without out_lang) -> ?ui=sv miss returns default LLM with out_lang="fi"
    #    and schedules 1 background job for "sv" (deduped across repeat calls).
    summary._inflight_jobs.clear()
    scheduled.clear()
    legacy_fi_payload = {
        "article": {"lang": "fi", "page_id": 1256, "title": "Talvisota"},
        "mode": "llm",
        "rev_id": 23500447,
        "tldr": "Suomenkielinen tiivistelmä.",
        "facts": [],
        "sections": [],
        "ghost_sections": [],
    }
    db_state["cache"][("fi", 1256, 23500447, "")] = json.dumps(legacy_fi_payload)
    r_sv_miss_1 = client.get("/api/summary/fi/1256?ui=sv")
    r_sv_miss_2 = client.get("/api/summary/fi/1256?ui=sv")
    assert r_sv_miss_1.status_code == 200
    assert r_sv_miss_2.status_code == 200
    d_sv_miss = r_sv_miss_1.json()
    assert d_sv_miss["mode"] == "llm"
    assert d_sv_miss["out_lang"] == "fi"
    assert d_sv_miss["tldr"] == "Suomenkielinen tiivistelmä."
    assert len(scheduled) == 1
    assert scheduled[0][1][0] == ("fi", 1256, 23500447, "sv")

    # 4. ui=en miss when neither '' nor 'en' is cached -> extractive with out_lang="fi"
    del db_state["cache"][("fi", 1256, 23500447, "")]
    scheduled.clear()
    summary._inflight_jobs.clear()
    r_en_miss = client.get("/api/summary/fi/1256?ui=en")
    assert r_en_miss.status_code == 200
    assert r_en_miss.json()["mode"] == "extractive"
    assert r_en_miss.json()["out_lang"] == "fi"
    assert len(scheduled) == 1
    assert scheduled[0][1][0] == ("fi", 1256, 23500447, "en")

    # 5. Building ui=sv LLM summary uses translated system prompt, preserves verbatim Finnish source,
    #    drops translated source, and writes ('fi', 1256, 23500447, 'sv') without touching '' row.
    recorded_calls: list[dict[str, Any]] = []

    class FakeMessages:
        def create(self, **kwargs):
            recorded_calls.append(kwargs)
            user_content = kwargs["messages"][0]["content"]
            if "<article_text" in user_content or user_content.startswith("Title: "):
                payload = {
                    "tldr": "Vinterkriget började den 30 november 1939.",
                    "facts": [
                        {"label": "Startdatum", "value": "30 november 1939", "source": lead_sentence},
                        {"label": "Translated", "value": "Bad", "source": "Vinterkriget började den 30 november 1939."},
                    ],
                }
            else:
                payload = {"one_line": "Avsnitt på svenska.", "summary": "Två meningar på svenska.", "facts": []}
            return type(
                "Resp",
                (),
                {
                    "stop_reason": "end_turn",
                    "usage": type("U", (), {"input_tokens": 50, "output_tokens": 25})(),
                    "content": [type("B", (), {"type": "text", "text": json.dumps(payload)})()],
                },
            )()

    fake_client = type("Client", (), {"messages": FakeMessages()})()
    built, stats, from_cache = summary.build_and_cache_llm_summary("fi", 1256, ui="sv", llm_client=fake_client)
    assert from_cache is False
    assert built["out_lang"] == "sv"
    assert built["tldr"] == "Vinterkriget började den 30 november 1939."
    assert len(built["facts"]) == 1
    assert built["facts"][0]["label"] == "Startdatum"
    assert built["facts"][0]["source"] == lead_sentence
    assert stats.facts_dropped == 1
    assert recorded_calls[0]["system"] == summary.TRANSLATED_SYSTEM_PROMPTS["sv"]
    assert ("fi", 1256, 23500447, "sv") in db_state["cache"]
    assert ("fi", 1256, 23500447, "") not in db_state["cache"]

    # 6. Subsequent GET ?ui=sv hits cache directly
    scheduled.clear()
    r_sv_hit = client.get("/api/summary/fi/1256?ui=sv")
    assert r_sv_hit.status_code == 200
    assert r_sv_hit.json()["out_lang"] == "sv"
    assert r_sv_hit.json()["mode"] == "llm"
    assert len(scheduled) == 0
