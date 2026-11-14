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
            if "WHERE lang = ? AND wikidata_id = ?" in s:
                lang, wid = params
                matches = [
                    r
                    for r in self._db["articles"].values()
                    if r[0] == lang and wid is not None and r[3] == wid
                ]
                matches.sort(key=lambda r: int(r[1]))
                if s.startswith("SELECT lang, page_id, rev_id, wikidata_id, title, url FROM"):
                    self.description = [
                        ("lang",),
                        ("page_id",),
                        ("rev_id",),
                        ("wikidata_id",),
                        ("title",),
                        ("url",),
                    ]
                    self._rows = [matches[0][:6]] if matches else []
                else:
                    self.description = [
                        ("lang",),
                        ("page_id",),
                        ("rev_id",),
                        ("wikidata_id",),
                        ("title",),
                        ("url",),
                        ("text",),
                    ]
                    self._rows = [matches[0]] if matches else []
            else:
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
        elif "LEFT JOIN wikirag.summary_cache d" in s:
            lang, pid, rev_id, ui = params
            u_key = (lang, int(pid), int(rev_id), str(ui))
            d_key = (lang, int(pid), int(rev_id), "")
            u_json = self._db["cache"].get(u_key)
            u_hash = self._db.get("cache_hashes", {}).get(u_key)
            d_json = self._db["cache"].get(d_key)
            self.description = [("json",), ("source_hash",), ("json",)]
            self._rows = [(u_json, u_hash, d_json)] if u_json is not None else []
        elif "FROM wikirag.summary_cache" in s:
            lang, pid, rev_id, ui = params
            cached = self._db["cache"].get((lang, int(pid), int(rev_id), str(ui)))
            self.description = [("json",)]
            self._rows = [(cached,)] if cached is not None else []
        elif s.startswith("INSERT INTO wikirag.summary_cache"):
            lang, pid, rev_id, ui, src_hash, payload = params
            key = (lang, int(pid), int(rev_id), str(ui))
            self._db["cache"][key] = payload
            self._db.setdefault("cache_hashes", {})[key] = src_hash
            self._rows = []
        elif "FROM wikirag.history_cache" in s:
            lang, pid, rev_id = params
            cached_hist = self._db.setdefault("history_cache", {}).get((lang, int(pid), int(rev_id)))
            self.description = [("json",)]
            self._rows = [(cached_hist,)] if cached_hist is not None else []
        elif s.startswith("INSERT INTO wikirag.history_cache"):
            lang, pid, rev_id, payload = params
            self._db.setdefault("history_cache", {})[(lang, int(pid), int(rev_id))] = payload
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

    # 5. Building ui=sv LLM summary translates from seeded '' default row, preserves verbatim
    #    Finnish source, writes ('fi', 1256, 23500447, 'sv') with source_hash, and leaves '' untouched.
    seeded_default = {
        "article": {
            "lang": "fi",
            "page_id": 1256,
            "wikidata_id": "Q134949",
            "title": "Talvisota",
            "url": "https://fi.wikipedia.org/wiki/Talvisota",
            "words": 1800,
            "reading_minutes": 8,
            "has_history": True,
        },
        "mode": "llm",
        "out_lang": "fi",
        "rev_id": 23500447,
        "tldr": "Talvisota alkoi 30. marraskuuta 1939.",
        "facts": [{"label": "Alkamispäivä", "value": "30. marraskuuta 1939", "source": lead_sentence}],
        "sections": [
            {
                "no": 1,
                "heading": "Osio 1",
                "words": 400,
                "reading_minutes": 2,
                "one_line": "Ensimmäinen osa.",
                "summary": "Kaksi lausetta suomeksi. Toinen lause.",
                "facts": [],
                "text": "Raaka teksti.",
                "history": {"added_year": 2005, "changes": 3, "war_years": []},
            }
        ],
        "ghost_sections": [],
    }
    seeded_default_json = json.dumps(seeded_default, separators=(",", ":"), ensure_ascii=False)
    db_state["cache"][("fi", 1256, 23500447, "")] = seeded_default_json
    recorded_calls: list[dict[str, Any]] = []

    class FakeMessages:
        def create(self, **kwargs):
            recorded_calls.append(kwargs)
            user_content = kwargs["messages"][0]["content"]
            start = user_content.index("<strings>\n") + len("<strings>\n")
            end = user_content.index("\n</strings>")
            items_in = json.loads(user_content[start:end])
            sv_map = {
                "Talvisota alkoi 30. marraskuuta 1939.": "Vinterkriget började den 30 november 1939.",
                "Alkamispäivä": "Startdatum",
                "30. marraskuuta 1939": "30 november 1939",
                "Ensimmäinen osa.": "Avsnitt på svenska.",
                "Kaksi lausetta suomeksi. Toinen lause.": "Två meningar på svenska.",
            }
            out_items = [{"id": it["id"], "text": sv_map.get(it["text"], f"[sv] {it['text']}")} for it in items_in]
            return type(
                "Resp",
                (),
                {
                    "stop_reason": "end_turn",
                    "usage": type("U", (), {"input_tokens": 50, "output_tokens": 25})(),
                    "content": [type("B", (), {"type": "text", "text": json.dumps({"items": out_items})})()],
                },
            )()

    fake_client = type("Client", (), {"messages": FakeMessages()})()
    built, stats, from_cache = summary.build_and_cache_llm_summary("fi", 1256, ui="sv", llm_client=fake_client)
    assert from_cache is False
    assert built["out_lang"] == "sv"
    assert built["variant"] == "translated"
    assert built["tldr"] == "Vinterkriget började den 30 november 1939."
    assert len(built["facts"]) == 1
    assert built["facts"][0]["label"] == "Startdatum"
    assert built["facts"][0]["source"] == lead_sentence
    assert len(recorded_calls) == 1
    assert recorded_calls[0]["max_tokens"] == 16000
    assert ("fi", 1256, 23500447, "sv") in db_state["cache"]
    assert db_state["cache"][("fi", 1256, 23500447, "")] == seeded_default_json

    # 6. Subsequent GET ?ui=sv hits fresh cache directly with 0 scheduled jobs
    scheduled.clear()
    r_sv_hit = client.get("/api/summary/fi/1256?ui=sv")
    assert r_sv_hit.status_code == 200
    assert r_sv_hit.json()["out_lang"] == "sv"
    assert r_sv_hit.json()["variant"] == "translated"
    assert r_sv_hit.json()["mode"] == "llm"
    assert len(scheduled) == 0


def _make_fake_translate_client(fn):
    recorded_calls: list[dict[str, Any]] = []

    class FakeMessages:
        def create(self, **kwargs):
            recorded_calls.append(kwargs)
            user_content = kwargs["messages"][0]["content"]
            start = user_content.index("<strings>\n") + len("<strings>\n")
            end = user_content.index("\n</strings>")
            items_in = json.loads(user_content[start:end])
            result = fn(items_in, kwargs)
            if result is None:
                return type(
                    "Resp",
                    (),
                    {
                        "stop_reason": "end_turn",
                        "usage": type("U", (), {"input_tokens": 10, "output_tokens": 0})(),
                        "content": [type("B", (), {"type": "text", "text": "not valid json"})()],
                    },
                )()
            return type(
                "Resp",
                (),
                {
                    "stop_reason": "end_turn",
                    "usage": type("U", (), {"input_tokens": 120, "output_tokens": 80})(),
                    "content": [type("B", (), {"type": "text", "text": json.dumps({"items": result})})()],
                },
            )()

    client = type("Client", (), {"messages": FakeMessages()})()
    client.recorded_calls = recorded_calls
    return client


def test_native_sibling_switch_and_fi_history_three_states(monkeypatch):
    fi_text = _make_long_article("Talvisota", num_sections=4)
    sv_text = _make_long_article("Vinterkriget", num_sections=4)
    nohist_fi_text = _make_long_article("Suomen Nato-jäsenhakemus", num_sections=4)
    nohist_sv_text = _make_long_article("Finlands Nato-medlemskapsansökan", num_sections=4)
    sv_only_text = _make_long_article("Svensk artikel", num_sections=4)
    en_only_text = _make_long_article("English counterpart", num_sections=4)

    db_state: dict[str, Any] = {
        "articles": {
            ("fi", 1256): (
                "fi",
                1256,
                23500447,
                "Q134949",
                "Talvisota",
                "https://fi.wikipedia.org/wiki/Talvisota",
                fi_text,
            ),
            ("sv", 23612): (
                "sv",
                23612,
                555001,
                "Q134949",
                "Vinterkriget",
                "https://sv.wikipedia.org/wiki/Vinterkriget",
                sv_text,
            ),
            ("fi", 777): (
                "fi",
                777,
                9001,
                "Q777",
                "Ei historiaa",
                "https://fi.wikipedia.org/wiki/Ei_historiaa",
                nohist_fi_text,
            ),
            ("sv", 888): (
                "sv",
                888,
                9002,
                "Q777",
                "Ingen historik",
                "https://sv.wikipedia.org/wiki/Ingen_historik",
                nohist_sv_text,
            ),
            ("sv", 999): (
                "sv",
                999,
                9901,
                "Q999",
                "Svensk artikel",
                "https://sv.wikipedia.org/wiki/Svensk_artikel",
                sv_only_text,
            ),
            ("en", 998): (
                "en",
                998,
                9902,
                "Q999",
                "English counterpart",
                "https://en.wikipedia.org/wiki/English_counterpart",
                en_only_text,
            ),
        },
        "cache": {},
        "cache_hashes": {},
        "history_cache": {},
        "svt_current": {
            1256: ("Talvisota", 24000000, "User", "", "== Osio 1 ==\nTeksti.", "2026-05-01 00:00:00", None),
        },
        "svt_first": {1256: "2024-01-01 00:00:00"},
        "svt_snaps": {
            (1256, 2024): ("Talvisota", 23000000, "User", "", "== Haamuluku ==\nPoistettu kappale riittävän pitkä.\n\n== Osio 1 ==\nVanha.", "2024-01-01 00:00:00", None),
            (1256, 2025): ("Talvisota", 23500000, "User", "", "== Osio 1 ==\nVanha.", "2025-01-01 00:00:00", None),
            (1256, 2026): ("Talvisota", 23800000, "User", "", "== Osio 1 ==\nUusi.", "2026-01-01 00:00:00", None),
        },
    }

    sv_default = {
        "article": {
            "lang": "sv",
            "page_id": 23612,
            "wikidata_id": "Q134949",
            "title": "Vinterkriget",
            "url": "https://sv.wikipedia.org/wiki/Vinterkriget",
            "words": 2000,
            "reading_minutes": 9,
            "has_history": False,
        },
        "mode": "llm",
        "out_lang": "sv",
        "rev_id": 555001,
        "tldr": "Vinterkriget var ett krig mellan Finland och Sovjetunionen.",
        "facts": [{"label": "Tid", "value": "1939–1940", "source": "Kriget varade 105 dagar."}],
        "sections": [
            {
                "no": 1,
                "heading": "Bakgrund",
                "words": 500,
                "reading_minutes": 3,
                "one_line": "Bakgrund till kriget.",
                "summary": "Sovjetunionen ställde krav hösten 1939.",
                "facts": [],
                "text": "Råtext på svenska.",
                "history": None,
            }
        ],
        "ghost_sections": [],
    }
    fi_default = {
        "article": {
            "lang": "fi",
            "page_id": 1256,
            "wikidata_id": "Q134949",
            "title": "Talvisota",
            "url": "https://fi.wikipedia.org/wiki/Talvisota",
            "words": 2000,
            "reading_minutes": 9,
            "has_history": True,
        },
        "mode": "llm",
        "out_lang": "fi",
        "rev_id": 23500447,
        "tldr": "Talvisota oli sota.",
        "facts": [],
        "sections": [
            {
                "no": 1,
                "heading": "Osio 1",
                "words": 400,
                "reading_minutes": 2,
                "one_line": "Yksi.",
                "summary": "Tiivistelmä.",
                "facts": [],
                "text": "Teksti.",
                "history": {"added_year": 2004, "changes": 5, "war_years": [2007]},
            },
            {
                "no": 2,
                "heading": "Osio 2",
                "words": 400,
                "reading_minutes": 2,
                "one_line": "Kaksi.",
                "summary": "Tiivistelmä 2.",
                "facts": [],
                "text": "Teksti 2.",
                "history": None,
            },
        ],
        "ghost_sections": [
            {
                "after_no": 1,
                "heading": "Haamuluku",
                "from_year": 2007,
                "removed_year": 2015,
                "text": "Poistettu teksti.",
                "oldid": 9876543,
            }
        ],
    }

    sv_default_json = json.dumps(sv_default, separators=(",", ":"), ensure_ascii=False)
    fi_default_json = json.dumps(fi_default, separators=(",", ":"), ensure_ascii=False)
    db_state["cache"][("sv", 23612, 555001, "")] = sv_default_json
    db_state["cache"][("fi", 1256, 23500447, "")] = fi_default_json
    db_state["cache"][("sv", 888, 9002, "")] = json.dumps({**sv_default, "article": {**sv_default["article"], "page_id": 888, "title": "Ingen historik"}, "rev_id": 9002})
    db_state["cache"][("en", 998, 9902, "")] = json.dumps({**sv_default, "article": {**sv_default["article"], "lang": "en", "page_id": 998, "title": "English counterpart"}, "out_lang": "en", "rev_id": 9902})

    monkeypatch.setattr(summary, "_open_rag", lambda: _FakeConn(db_state))
    monkeypatch.setattr(summary, "_open_svt", lambda: _FakeConn(db_state))
    monkeypatch.setattr(summary, "_cache_table_ready", False)
    summary._inflight_jobs.clear()

    scheduled: list[tuple] = []
    monkeypatch.setenv("SUMMARY_LLM", "1")
    monkeypatch.setattr(BackgroundTasks, "add_task", lambda self, fn, *args: scheduled.append((fn, args)))

    client = TestClient(main.app)

    # A6: ui absent and ui == lang return byte-identical stored default JSON
    r_sv_plain = client.get("/api/summary/sv/23612")
    r_sv_same = client.get("/api/summary/sv/23612?ui=sv")
    assert r_sv_plain.status_code == 200
    assert r_sv_plain.content == sv_default_json.encode("utf-8")
    assert r_sv_same.content == sv_default_json.encode("utf-8")

    # C1a: fi:1256?ui=sv -> native sv:23612 + fi_history from fi default row + history_status=="ready", 0 jobs
    r_nat = client.get("/api/summary/fi/1256?ui=sv")
    assert r_nat.status_code == 200
    d_nat = r_nat.json()
    assert d_nat["variant"] == "native"
    assert d_nat["out_lang"] == "sv"
    assert d_nat["article"]["lang"] == "sv"
    assert d_nat["article"]["page_id"] == 23612
    assert d_nat["requested"] == {
        "lang": "fi",
        "page_id": 1256,
        "title": "Talvisota",
        "url": "https://fi.wikipedia.org/wiki/Talvisota",
    }
    assert d_nat["history_status"] == "ready"
    assert d_nat["fi_history"] == {
        "article": {
            "lang": "fi",
            "page_id": 1256,
            "title": "Talvisota",
            "url": "https://fi.wikipedia.org/wiki/Talvisota",
        },
        "rev_id": 23500447,
        "sections": [{"no": 1, "heading": "Osio 1", "history": {"added_year": 2004, "changes": 5, "war_years": [2007]}}],
        "ghost_sections": fi_default["ghost_sections"],
    }
    assert len(scheduled) == 0

    # C1b: sv sibling default missing -> extractive sv + 1 background job ("sv", 23612, 555001, "")
    del db_state["cache"][("sv", 23612, 555001, "")]
    r_nat_miss = client.get("/api/summary/fi/1256?ui=sv")
    assert r_nat_miss.status_code == 200
    d_miss = r_nat_miss.json()
    assert d_miss["variant"] == "native"
    assert d_miss["mode"] == "extractive"
    assert d_miss["article"]["page_id"] == 23612
    assert len(scheduled) == 1
    assert scheduled[0][1][0] == ("sv", 23612, 555001, "")

    # C1c: ui=fi on sv:23612 with fi sibling -> native fi, fi_history is None
    db_state["cache"][("sv", 23612, 555001, "")] = sv_default_json
    scheduled.clear()
    summary._inflight_jobs.clear()
    r_to_fi = client.get("/api/summary/sv/23612?ui=fi")
    assert r_to_fi.status_code == 200
    d_to_fi = r_to_fi.json()
    assert d_to_fi["variant"] == "native"
    assert d_to_fi["out_lang"] == "fi"
    assert d_to_fi["article"]["page_id"] == 1256
    assert d_to_fi["fi_history"] is None
    assert d_to_fi["history_status"] == "ready"

    # Amendment 016-A: fi_history must NOT depend on Finnish summary_cache!
    # Delete ('fi', 1256, 23500447, '') from summary_cache and disable LLM -> 'building' state schedules
    # ONE history-only background job (no LLM) and after running it returns 'ready' with fi_history!
    del db_state["cache"][("fi", 1256, 23500447, "")]
    monkeypatch.setenv("SUMMARY_LLM", "0")
    scheduled.clear()
    summary._inflight_jobs.clear()
    r_building = client.get("/api/summary/fi/1256?ui=sv")
    assert r_building.status_code == 200
    d_building = r_building.json()
    assert d_building["history_status"] == "building"
    assert d_building["fi_history"] is None
    assert len(scheduled) == 1
    hist_fn, hist_args = scheduled[0]
    assert hist_args[0][0] == "history"
    assert hist_args[0][1] == 1256

    # Run background history worker -> writes history_cache ONLY (fi summary_cache stays empty!)
    hist_fn(*hist_args)
    assert ("fi", 1256, 23500447, "") not in db_state["cache"]
    assert ("fi", 1256, 23500447) in db_state["history_cache"]

    scheduled.clear()
    r_after_hist = client.get("/api/summary/fi/1256?ui=sv")
    assert r_after_hist.status_code == 200
    d_after_hist = r_after_hist.json()
    assert d_after_hist["history_status"] == "ready"
    assert d_after_hist["fi_history"] is not None
    assert d_after_hist["fi_history"]["article"]["page_id"] == 1256
    assert len(d_after_hist["fi_history"]["sections"]) >= 1
    assert len(scheduled) == 0

    # history_status == 'none': (a) fi sibling has no SVT history
    r_no_svt = client.get("/api/summary/fi/777?ui=sv")
    assert r_no_svt.status_code == 200
    assert r_no_svt.json()["history_status"] == "none"
    assert r_no_svt.json()["fi_history"] is None

    # history_status == 'none': (b) no fi sibling
    r_no_fi_sib = client.get("/api/summary/sv/999?ui=en")
    assert r_no_fi_sib.status_code == 200
    assert r_no_fi_sib.json()["history_status"] == "none"
    assert r_no_fi_sib.json()["fi_history"] is None


def test_summary_translated_build_and_validate(monkeypatch):
    art_text = _make_long_article("Suomi 1980-luvulla", num_sections=4)
    default_payload = {
        "article": {
            "lang": "fi",
            "page_id": 966363,
            "wikidata_id": "Q18693692",
            "title": "Suomi 1980-luvulla",
            "url": "https://fi.wikipedia.org/wiki/Suomi_1980-luvulla",
            "words": 5000,
            "reading_minutes": 21,
            "has_history": True,
        },
        "mode": "llm",
        "out_lang": "fi",
        "rev_id": 24001001,
        "tldr": "Suomen 1980-luku oli kasvun aikaa.",
        "facts": [
            {"label": "Aika", "value": "1980–1989", "source": "Lähde 0."},
            {"label": "Kasvu", "value": "Voimakas", "source": "Kasvu oli vahvaa."},
        ],
        "sections": [
            {
                "no": 1,
                "heading": "OtsikkoYksi",
                "words": 300,
                "reading_minutes": 2,
                "one_line": "Toistuva teksti.",
                "summary": "Talous kasvoi nopeasti.",
                "facts": [{"label": "Aika", "value": "1980-luku", "source": "Lähde 1."}],
                "text": "Raakateksti 1",
                "history": {"added_year": 2006, "changes": 10, "war_years": []},
            },
            {
                "no": 2,
                "heading": "Politiikka",
                "words": 300,
                "reading_minutes": 2,
                "one_line": "Toistuva teksti.",
                "summary": "Politiikassa tapahtui muutoksia.",
                "facts": [],
                "text": "Raakateksti 2",
                "history": {"added_year": 2006, "changes": 4, "war_years": [2009]},
            },
            {
                "no": 3,
                "heading": "Kulttuuri",
                "words": 300,
                "reading_minutes": 2,
                "one_line": "Kulttuuri kukoisti.",
                "summary": "Musiikki ja elokuva kehittyivät.",
                "facts": [],
                "text": "Raakateksti 3",
                "history": None,
            },
            {
                "no": 4,
                "heading": "Urheilu",
                "words": 300,
                "reading_minutes": 2,
                "one_line": "Urheilu menestyi.",
                "summary": "Suomi sai mitaleja.",
                "facts": [],
                "text": "Raakateksti 4",
                "history": None,
            },
        ],
        "ghost_sections": [
            {"after_no": 1, "heading": "Haamu A", "from_year": 2007, "removed_year": 2012, "text": "Haamuteksti A", "oldid": 111},
            {"after_no": 3, "heading": "Haamu B", "from_year": 2008, "removed_year": 2014, "text": "Haamuteksti B", "oldid": 222},
        ],
    }
    default_json = json.dumps(default_payload, separators=(",", ":"), ensure_ascii=False)
    db_state = {
        "articles": {
            ("fi", 966363): (
                "fi",
                966363,
                24001001,
                "Q18693692",
                "Suomi 1980-luvulla",
                "https://fi.wikipedia.org/wiki/Suomi_1980-luvulla",
                art_text,
            )
        },
        "cache": {("fi", 966363, 24001001, ""): default_json},
        "cache_hashes": {},
        "history_cache": {},
        "svt_current": {},
        "svt_first": {},
        "svt_snaps": {},
    }
    monkeypatch.setattr(summary, "_open_rag", lambda: _FakeConn(db_state))
    monkeypatch.setattr(summary, "_open_svt", lambda: _FakeConn(db_state))
    monkeypatch.setattr(summary, "_cache_table_ready", False)

    # Normal build with repeated strings ("Toistuva teksti." & "Aika")
    fake_client = _make_fake_translate_client(
        lambda items_in, _kw: [{"id": it["id"], "text": f"SV:{it['text']}"} for it in items_in]
    )
    built, stats, from_cache = summary.build_and_cache_llm_summary("fi", 966363, ui="sv", llm_client=fake_client)
    assert from_cache is False
    assert built["out_lang"] == "sv"
    assert built["variant"] == "translated"
    assert built["history_status"] == "ready"
    assert built["requested"]["page_id"] == 966363
    assert stats.total_calls == 1
    assert stats.failed_calls == 0

    # (b) No source/heading/text/ghost text sent to translator
    user_msg = fake_client.recorded_calls[0]["messages"][0]["content"]
    assert fake_client.recorded_calls[0]["max_tokens"] == 16000
    for forbidden in ["Lähde 0.", "Kasvu oli vahvaa.", "Lähde 1.", "OtsikkoYksi", "Raakateksti 1", "Haamuteksti A", "Haamuteksti B"]:
        assert forbidden not in user_msg
    # (c) Repeated string sent once
    start = user_msg.index("<strings>\n") + len("<strings>\n")
    end = user_msg.index("\n</strings>")
    sent_texts = [x["text"] for x in json.loads(user_msg[start:end])]
    assert sent_texts.count("Toistuva teksti.") == 1
    assert sent_texts.count("Aika") == 1
    assert built["sections"][0]["one_line"] == "SV:Toistuva teksti."
    assert built["sections"][1]["one_line"] == "SV:Toistuva teksti."

    # (a) Structural deep equality ignoring translated strings & envelope fields
    def _strip_translated(p):
        c = json.loads(json.dumps(p))
        for k in ("out_lang", "variant", "requested", "history_status", "tldr"):
            c.pop(k, None)
        for f in c.get("facts", []):
            f.pop("label", None)
            f.pop("value", None)
        for s in c.get("sections", []):
            s.pop("one_line", None)
            s.pop("summary", None)
            for f in s.get("facts", []):
                f.pop("label", None)
                f.pop("value", None)
        return c

    assert _strip_translated(built) == _strip_translated(default_payload)
    # (f) Written source_hash matches stored default row
    assert db_state["cache_hashes"][("fi", 966363, 24001001, "sv")] == summary.source_hash(default_json)

    # (d) Partial empty fallback: only that string keeps original
    partial_client = _make_fake_translate_client(
        lambda items_in, _kw: [
            {"id": it["id"], "text": "" if it["id"] == "t0" else f"SV2:{it['text']}"}
            for it in items_in
        ]
    )
    built_p, stats_p, _ = summary.build_and_cache_llm_summary("fi", 966363, force=True, ui="sv", llm_client=partial_client)
    assert stats_p.translate_fallbacks == 1
    assert built_p["tldr"] == default_payload["tldr"]
    assert built_p["sections"][0]["one_line"] == "SV2:Toistuva teksti."
    # (g) Default row unchanged even with force=True
    assert db_state["cache"][("fi", 966363, 24001001, "")] == default_json

    # (e) None / unparseable LLM response -> no write, failed_calls==1
    del db_state["cache"][("fi", 966363, 24001001, "sv")]
    none_client = _make_fake_translate_client(lambda _items, _kw: None)
    res_none, stats_none, _ = summary.build_and_cache_llm_summary("fi", 966363, ui="sv", llm_client=none_client)
    assert stats_none.failed_calls == 1
    assert res_none["tldr"] == default_payload["tldr"]
    assert ("fi", 966363, 24001001, "sv") not in db_state["cache"]


def test_summary_staleness_and_background_rebuild(monkeypatch):
    art_text = _make_long_article("Suomi 1980-luvulla", num_sections=4)
    default_v1 = {
        "article": {"lang": "fi", "page_id": 966363, "wikidata_id": "Q1", "title": "Suomi 1980-luvulla", "url": "https://fi.wikipedia.org/wiki/Suomi_1980-luvulla", "words": 5000, "reading_minutes": 21, "has_history": False},
        "mode": "llm",
        "out_lang": "fi",
        "rev_id": 24001001,
        "tldr": "Versio 1.",
        "facts": [],
        "sections": [],
        "ghost_sections": [],
    }
    default_v2 = {**default_v1, "tldr": "Versio 2."}
    default_v1_json = json.dumps(default_v1, separators=(",", ":"), ensure_ascii=False)
    default_v2_json = json.dumps(default_v2, separators=(",", ":"), ensure_ascii=False)
    sv_row = {
        **default_v1,
        "out_lang": "sv",
        "variant": "translated",
        "history_status": "none",
        "requested": {"lang": "fi", "page_id": 966363, "title": "Suomi 1980-luvulla", "url": "https://fi.wikipedia.org/wiki/Suomi_1980-luvulla"},
        "tldr": "Version 1 på svenska.",
    }
    sv_row_json = json.dumps(sv_row, separators=(",", ":"), ensure_ascii=False)

    db_state = {
        "articles": {("fi", 966363): ("fi", 966363, 24001001, "Q1", "Suomi 1980-luvulla", "https://fi.wikipedia.org/wiki/Suomi_1980-luvulla", art_text)},
        "cache": {
            ("fi", 966363, 24001001, ""): default_v1_json,
            ("fi", 966363, 24001001, "sv"): sv_row_json,
        },
        "cache_hashes": {
            ("fi", 966363, 24001001, "sv"): summary.source_hash(default_v1_json),
        },
        "history_cache": {},
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

    # Fresh -> verbatim, 0 jobs
    r_fresh = client.get("/api/summary/fi/966363?ui=sv")
    assert r_fresh.status_code == 200
    assert r_fresh.content == sv_row_json.encode("utf-8")
    assert len(scheduled) == 0

    # Stale via changed default hash (simulate regenerated '' row or wrong hash)
    db_state["cache"][("fi", 966363, 24001001, "")] = default_v2_json
    r_stale = client.get("/api/summary/fi/966363?ui=sv")
    assert r_stale.status_code == 200
    d_stale = r_stale.json()
    assert d_stale["variant"] == "fallback"
    assert d_stale["out_lang"] == "fi"
    assert d_stale["tldr"] == "Versio 2."
    assert len(scheduled) == 1
    assert scheduled[0][1][0] == ("fi", 966363, 24001001, "sv")

    # Also stale when source_hash is NULL
    summary._inflight_jobs.clear()
    scheduled.clear()
    db_state["cache_hashes"][("fi", 966363, 24001001, "sv")] = None
    r_null_hash = client.get("/api/summary/fi/966363?ui=sv")
    assert r_null_hash.json()["variant"] == "fallback"
    assert len(scheduled) == 1

    # Run scheduled background worker with fake LLM -> next GET is fresh translated
    rebuild_client = _make_fake_translate_client(
        lambda items_in, _kw: [{"id": it["id"], "text": "Version 2 på svenska."} for it in items_in]
    )
    fn, args = scheduled[0]
    fn(args[0], rebuild_client)

    scheduled.clear()
    r_rebuilt = client.get("/api/summary/fi/966363?ui=sv")
    assert r_rebuilt.status_code == 200
    assert r_rebuilt.json()["variant"] == "translated"
    assert r_rebuilt.json()["out_lang"] == "sv"
    assert r_rebuilt.json()["tldr"] == "Version 2 på svenska."
    assert db_state["cache_hashes"][("fi", 966363, 24001001, "sv")] == summary.source_hash(default_v2_json)
    assert len(scheduled) == 0

