"""Tests for backend/ask.py: unit tests (offline) + live MariaDB integration check."""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys
from types import SimpleNamespace
from typing import Any

from fastapi.testclient import TestClient
import mariadb
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend import ask, history, main, rag_common, summary, svt_common  # noqa: E402


class FakeCursor:
    """In-memory cursor simulating answer_cache, retrieval, sibling lookup, and Way A history SQL."""

    def __init__(self, store: dict[str, Any]):
        self.store = store
        self.description: list[tuple[str]] = []
        self._rows: list[tuple[Any, ...]] = []

    def execute(self, sql: str, params: tuple[Any, ...] = ()) -> None:
        s = " ".join(sql.split())
        if s.startswith("CREATE TABLE IF NOT EXISTS wikirag.answer_cache"):
            self.description = []
            self._rows = []
            return
        if s.startswith("SELECT json FROM wikirag.answer_cache"):
            row = self.store["cache"].get(params[0])
            self.description = [("json",)]
            self._rows = [(row,)] if row is not None else []
            return
        if s.startswith("INSERT INTO wikirag.answer_cache"):
            q_hash, q_text, serialized, _model = params
            self.store["cache"][q_hash] = serialized
            self.store["cache_queries"].append(q_text)
            self.description = []
            self._rows = []
            return
        if "FROM wikirag.chunk_vector cv" in s and "JOIN wikihistory.article FOR SYSTEM_TIME" not in s:
            cols = [
                "lang",
                "page_id",
                "chunk_no",
                "d",
                "section",
                "chunk_text",
                "title",
                "url",
                "rev_id",
                "wikidata_id",
            ]
            self.description = [(c,) for c in cols]
            self._rows = [tuple(r[c] for c in cols) for r in self.store["retrieval_rows"]]
            return
        if s.startswith("SELECT COUNT(*) FROM wikirag.chunk_vector"):
            self.description = [("cnt",)]
            self._rows = [(len(self.store["retrieval_rows"]),)]
            return
        if s.startswith("SELECT wikidata_id, page_id FROM wikirag.article WHERE lang = 'fi'"):
            self.description = [("wikidata_id",), ("page_id",)]
            self._rows = [
                (wid, self.store["fi_siblings"][wid])
                for wid in params
                if wid in self.store["fi_siblings"]
            ]
            return
        if s.startswith("SELECT DISTINCT page_id FROM wikihistory.article WHERE page_id IN"):
            self.description = [("page_id",)]
            self._rows = [(pid,) for pid in params if pid in self.store["history_pids"]]
            return
        if s.startswith("SELECT MIN(row_start) FROM wikihistory.article"):
            pid = params[0]
            snaps = self.store["history_snapshots"].get(pid, {})
            if not snaps:
                self._rows = [(None,)]
            else:
                first_dt = min(v["row_start"] for v in snaps.values())
                self._rows = [(first_dt,)]
            self.description = [("first_edit",)]
            return
        if "JOIN wikihistory.article FOR SYSTEM_TIME AS OF TIMESTAMP" in s:
            _vec, ts, pid = params
            yr = int(str(ts)[:4])
            snap = self.store["history_snapshots"].get(pid, {}).get(yr)
            cols = ["lang", "page_id", "chunk_no", "section", "rev_id", "user", "comment", "row_start", "text"]
            self.description = [(c,) for c in cols]
            if snap is None:
                self._rows = []
            else:
                self._rows = [
                    (
                        "fi",
                        pid,
                        0,
                        snap.get("chunk_section"),
                        snap["rev_id"],
                        snap["user"],
                        snap["comment"],
                        snap["row_start"],
                        snap["text"],
                    )
                ]
            return
        raise AssertionError(f"Unhandled fake SQL: {s}")

    def fetchone(self) -> tuple[Any, ...] | None:
        return self._rows[0] if self._rows else None

    def fetchall(self) -> list[tuple[Any, ...]]:
        return list(self._rows)

    def close(self) -> None:
        pass


class FakeConnection:
    """In-memory connection wrapper for FakeCursor."""

    def __init__(self, store: dict[str, Any]):
        self.store = store

    def cursor(self) -> FakeCursor:
        return FakeCursor(self.store)

    def commit(self) -> None:
        pass

    def close(self) -> None:
        pass


def _make_fake_llm_client(responses: list[dict[str, Any] | str]) -> Any:
    """Return a fake Anthropic client emitting sequential JSON or refusal/max_tokens responses."""
    state = {"idx": 0}
    calls: list[dict[str, Any]] = []

    class FakeMessages:
        def create(self, **kwargs: Any) -> Any:
            calls.append(kwargs)
            item = responses[min(state["idx"], len(responses) - 1)]
            state["idx"] += 1
            if item == "refusal":
                return SimpleNamespace(
                    stop_reason="refusal",
                    content=[],
                    usage=SimpleNamespace(input_tokens=10, output_tokens=5),
                )
            if item == "max_tokens":
                return SimpleNamespace(
                    stop_reason="max_tokens",
                    content=[SimpleNamespace(type="text", text='{"found": true')],
                    usage=SimpleNamespace(input_tokens=10, output_tokens=4000),
                )
            return SimpleNamespace(
                stop_reason="end_turn",
                content=[SimpleNamespace(type="text", text=json.dumps(item, ensure_ascii=False))],
                usage=SimpleNamespace(input_tokens=120, output_tokens=45),
            )

    client = SimpleNamespace(messages=FakeMessages(), recorded_calls=calls)
    return client


def test_normalize_question_and_hash():
    a = "  How  did\tthe\nWinter War end?!.  "
    b = "how did the winter war end"
    assert ask.normalize_question(a) == b
    assert ask.question_hash(a) == ask.question_hash(b)
    # Combining diaeresis vs precomposed NFC ä must match.
    assert ask.question_hash("Miten talvisota pa\u0308a\u0308ttyi?") == ask.question_hash("Miten talvisota päättyi")


def test_strip_header_and_extract_best_chunk_first_sentence():
    chunk1 = "Winter War — Background\n\n### Heading Foo\nThe Moscow Peace Treaty ended the war. Fighting stopped at 11:00."
    assert ask.strip_chunk_header(chunk1).startswith("### Heading Foo")
    assert ask.extract_best_chunk_first_sentence(chunk1) == "The Moscow Peace Treaty ended the war."

    chunk2 = "Winter War\n\n### Finnish-Soviet relations started in 1920."
    assert ask.extract_best_chunk_first_sentence(chunk2) == "Finnish-Soviet relations started in 1920."


def test_extract_year_context_heading_match_and_fallback():
    wt = (
        "Talvisota alkoi vuonna 1939.\n\n"
        "== Tausta ==\nSuomi ja Neuvostoliitto neuvottelivat.\n\n"
        "== [[Moskovan rauha|Rauhansopimus]] ==\nRauha solmittiin 12. maaliskuuta 1940.\n"
    )
    matched = ask.extract_year_context(wt, ["Rauhansopimus"])
    assert "Rauha solmittiin 12. maaliskuuta 1940." in matched
    assert "neuvottelivat" not in matched

    # When chunk heading is absent in older year wikitext, whole cleaned article becomes context.
    old_wt = "Talvisota käytiin 1939–1940.\n\n== Historia ==\nSota päättyi rauhaan.\n"
    fallback = ask.extract_year_context(old_wt, ["Rauhansopimus"])
    assert "Talvisota käytiin 1939–1940." in fallback
    assert "Sota päättyi rauhaan." in fallback


def test_filter_grounded_ask_facts():
    ctx_by_n = {1: "The treaty was signed   on 12 March 1940 in Moscow."}
    url_by_n = {1: "https://fi.wikipedia.org/w/index.php?oldid=999"}
    kept, kept_n, dropped_n = ask.filter_grounded_ask_facts(
        [
            {"text": "Signed 12 March 1940", "source_sentence": "The treaty was signed on 12 March 1940 in Moscow.", "n": 1},
            {"text": "Hallucinated", "source_sentence": "Completely invented claim.", "n": 1},
            {"text": "Bad source idx", "source_sentence": "signed on 12 March 1940", "n": 2},
        ],
        ctx_by_n,
        url_by_n,
    )
    assert kept_n == 1
    assert dropped_n == 2
    assert kept[0]["source_sentence"] == "The treaty was signed   on 12 March 1940 in Moscow."
    assert kept[0]["url"] == url_by_n[1]


def test_select_llm_year_indices_dedupe_and_cap():
    snaps = []
    for i in range(25):
        # First 3 years identical -> dedupes to 23 unique contexts (indices 0, 3..24).
        tag = "same" if i < 3 else f"ctx-{i}"
        h = hashlib.sha256(tag.encode()).hexdigest()
        snaps.append({"year": 2002 + i, "context_hash": h})

    selected = ask.select_llm_year_indices(snaps, max_calls=12)
    assert len(selected) == 12
    assert selected[0] == 0
    assert selected[-1] == 24
    assert selected == sorted(set(selected))
    assert 1 not in selected and 2 not in selected


def test_merge_milestones_hash_and_all_not_found():
    assert ask.compute_answer_hash(
        True,
        [{"text": "Signed  12 March 1940"}, {"text": "Ceded Karelia"}],
    ) == ask.compute_answer_hash(
        True,
        [{"text": "ceded karelia"}, {"text": "signed 12 march 1940"}],
    )

    entries = [
        {
            "year": 2004,
            "found": False,
            "answer": ask.NO_ANSWER_MILESTONE_TEXT,
            "facts": [],
            "rev_id": 100,
            "user": "A",
            "comment": "init",
            "row_start": "2004-05-01T10:00:00Z",
            "url": "https://fi.wikipedia.org/w/index.php?oldid=100",
        },
        {
            "year": 2005,
            "found": False,
            "answer": ask.NO_ANSWER_MILESTONE_TEXT,
            "facts": [],
            "rev_id": 101,
            "user": "B",
            "comment": "typo",
            "row_start": "2005-06-01T10:00:00Z",
            "url": "https://fi.wikipedia.org/w/index.php?oldid=101",
        },
        {
            "year": 2006,
            "found": True,
            "answer": "Signed March 1940.",
            "facts": [
                {
                    "text": "Signed March 1940",
                    "source_sentence": "Rauha solmittiin maaliskuussa 1940.",
                    "url": "https://fi.wikipedia.org/w/index.php?oldid=102",
                }
            ],
            "rev_id": 102,
            "user": "C",
            "comment": "add treaty",
            "row_start": "2006-07-01T10:00:00Z",
            "url": "https://fi.wikipedia.org/w/index.php?oldid=102",
        },
        {
            "year": 2007,
            "found": True,
            "answer": "Different phrasing same fact.",
            "facts": [
                {
                    "text": "  signed   march  1940 ",
                    "source_sentence": "Sopimus solmittiin maaliskuussa 1940.",
                    "url": "https://fi.wikipedia.org/w/index.php?oldid=103",
                }
            ],
            "rev_id": 103,
            "user": "D",
            "comment": "copyedit",
            "row_start": "2007-08-01T10:00:00Z",
            "url": "https://fi.wikipedia.org/w/index.php?oldid=103",
        },
    ]
    ms = ask.merge_milestones(entries)
    assert len(ms) == 2
    assert (ms[0]["from_year"], ms[0]["to_year"], ms[0]["found"], ms[0]["rev_id"]) == (2004, 2005, False, 100)
    assert ms[0]["answer"] == ask.NO_ANSWER_MILESTONE_TEXT
    assert ms[0]["facts"] == []
    assert (ms[1]["from_year"], ms[1]["to_year"], ms[1]["found"], ms[1]["rev_id"]) == (2006, 2007, True, 102)
    assert ms[1]["facts"][0]["url"] == "https://fi.wikipedia.org/w/index.php?oldid=102"

    all_false = ask.merge_milestones(entries[:2])
    assert len(all_false) == 1
    assert (all_false[0]["from_year"], all_false[0]["to_year"], all_false[0]["found"]) == (2004, 2005, False)


def test_yearly_grounding_flip_and_refusal_becomes_found_false():
    snapshots = [
        {
            "year": 2004,
            "rev_id": 100,
            "user": "U1",
            "comment": "c1",
            "row_start": "2004-05-01T00:00:00Z",
            "url": "https://fi.wikipedia.org/w/index.php?oldid=100",
            "context_text": "Artikkelissa mainitaan talvisota.",
            "context_hash": "h1",
        },
        {
            "year": 2005,
            "rev_id": 200,
            "user": "U2",
            "comment": "c2",
            "row_start": "2005-05-01T00:00:00Z",
            "url": "https://fi.wikipedia.org/w/index.php?oldid=200",
            "context_text": "Moskovan rauha allekirjoitettiin 1940.",
            "context_hash": "h2",
        },
    ]
    client = _make_fake_llm_client(
        [
            # Year 2004 claims found=true, but source_sentence is ungrounded -> flips found=false!
            {
                "found": True,
                "answer": "Invented year answer.",
                "facts": [{"text": "Fact", "source_sentence": "Not in context!", "n": 1}],
            },
            # Year 2005 gets stop_reason=refusal -> becomes found=false!
            "refusal",
        ]
    )
    stats = ask.AskBuildStats(
        q="Test",
        q_hash="abc",
        top_lang="fi",
        top_page_id=52097,
        history_available=True,
        history_resolution="direct",
        sql_mode="single_stmt",
    )
    yearly = ask._run_history_llms(client, "claude-haiku-5-5", "Test?", snapshots, 12, stats)
    assert yearly[0]["found"] is False
    assert yearly[0]["answer"] == ask.NO_ANSWER_MILESTONE_TEXT
    assert yearly[0]["facts"] == []
    assert yearly[1]["found"] is False
    assert stats.history_facts_dropped == 1
    assert stats.failed_calls == 1


def _sample_store(*, with_history: bool = True) -> dict[str, Any]:
    rows = [
        {
            "lang": "fi",
            "page_id": 52097,
            "chunk_no": 0,
            "d": 0.12,
            "section": "Rauhansopimus",
            "chunk_text": "Moskovan rauhansopimus (1940) — Rauhansopimus\n\nMoskovan rauhansopimus solmittiin 12. maaliskuuta 1940. Se päätti talvisodan.",
            "title": "Moskovan rauhansopimus (1940)",
            "url": "https://fi.wikipedia.org/wiki/Moskovan_rauhansopimus_(1940)",
            "rev_id": 22491034,
            "wikidata_id": "Q324949",
        },
        {
            "lang": "fi",
            "page_id": 1256,
            "chunk_no": 1,
            "d": 0.19,
            "section": "Rauha",
            "chunk_text": "Talvisota — Rauha\n\nTalvisota päättyi 13. maaliskuuta 1940.",
            "title": "Talvisota",
            "url": "https://fi.wikipedia.org/wiki/Talvisota",
            "rev_id": 22500001,
            "wikidata_id": "Q170565",
        },
    ]
    now_year = datetime.now(timezone.utc).year
    history_snaps = {}
    if with_history:
        history_snaps[52097] = {
            2024: {
                "chunk_section": "Rauhansopimus",
                "rev_id": 412098,
                "user": "Kahkonen",
                "comment": "alku",
                "row_start": datetime(2024, 5, 14, 12, 10, 0),
                "text": "== Rauhansopimus ==\nSopimus allekirjoitettiin 1940.",
            },
            now_year: {
                "chunk_section": "Rauhansopimus",
                "rev_id": 999111,
                "user": "Risukarhi",
                "comment": "tarkennus",
                "row_start": datetime(now_year, 1, 10, 9, 0, 0),
                "text": "== Rauhansopimus ==\nMoskovan rauhansopimus solmittiin 12. maaliskuuta 1940 ja se päätti talvisodan.",
            },
        }
        # Fill intermediate years cleanly if now_year > 2025
        for yr in range(2025, now_year):
            history_snaps[52097][yr] = dict(history_snaps[52097][2024])
            history_snaps[52097][yr]["row_start"] = datetime(yr, 1, 1, 0, 0, 0)

    return {
        "cache": {},
        "cache_queries": [],
        "retrieval_rows": rows if with_history else [
            {
                "lang": "sv",
                "page_id": 18112,
                "chunk_no": 0,
                "d": 0.15,
                "section": None,
                "chunk_text": "Carl Ludvig Engel\n\nCarl Ludvig Engel var en tysk-finländsk arkitekt.",
                "title": "Carl Ludvig Engel",
                "url": "https://sv.wikipedia.org/wiki/Carl_Ludvig_Engel",
                "rev_id": 555000,
                "wikidata_id": "Q77211",
            }
        ],
        "fi_siblings": {"Q77211": 142},
        "history_pids": {52097, 1256} if with_history else set(),
        "history_snapshots": history_snaps,
    }


def test_endpoint_validation_pending_single_flight_and_cache_hit(monkeypatch):
    global_store = _sample_store(with_history=True)
    ask._cache_table_ready = False
    ask._inflight_jobs.clear()

    client = _make_fake_llm_client(
        [
            # Current answer LLM
            {
                "found": True,
                "answer": "The Winter War ended with the Moscow Peace Treaty signed 12 March 1940 [1].",
                "facts": [
                    {
                        "text": "Moscow Peace Treaty signed 12 March 1940",
                        "source_sentence": "Moskovan rauhansopimus solmittiin 12. maaliskuuta 1940.",
                        "n": 1,
                    }
                ],
            },
            # History year 2024 (first snapshot year)
            {
                "found": True,
                "answer": "The treaty was signed in 1940.",
                "facts": [
                    {
                        "text": "Signed in 1940",
                        "source_sentence": "Sopimus allekirjoitettiin 1940.",
                        "n": 1,
                    }
                ],
            },
            # History current year
            {
                "found": True,
                "answer": "Signed on 12 March 1940 ending the Winter War.",
                "facts": [
                    {
                        "text": "Signed 12 March 1940 ending the Winter War",
                        "source_sentence": "Moskovan rauhansopimus solmittiin 12. maaliskuuta 1940 ja se päätti talvisodan.",
                        "n": 1,
                    }
                ],
            },
        ]
    )

    embed_calls = {"n": 0}

    def fake_embed(texts: list[str]) -> tuple[list[list[float]], int]:
        embed_calls["n"] += 1
        return [[0.1, 0.2, 0.3]], 5

    scheduled: list[tuple[Any, tuple[Any, ...]]] = []

    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-dummy-key")
    monkeypatch.setattr(ask.summary, "_open_rag", lambda: FakeConnection(global_store))
    monkeypatch.setattr(ask.summary, "_default_anthropic_client", lambda: client)
    monkeypatch.setattr(ask.rag_common, "embed", lambda texts, truncate=True: fake_embed(texts))
    monkeypatch.setattr(ask, "CACHE_GET_SQL", ask.CACHE_GET_SQL)

    # Intercept FastAPI BackgroundTasks.add_task to verify single-flight without auto-executing inline.
    from fastapi import BackgroundTasks

    def capture_add_task(self: BackgroundTasks, func: Any, *args: Any, **kwargs: Any) -> None:
        scheduled.append((func, args))

    monkeypatch.setattr(BackgroundTasks, "add_task", capture_add_task)

    tc = TestClient(main.app)

    # 1. Empty / whitespace q -> 422
    assert tc.get("/api/ask").status_code == 422
    assert tc.get("/api/ask?q=").status_code == 422
    assert tc.get("/api/ask?q=%20%20%20").status_code == 422

    # 2. First cache miss -> returns pending immediately with zero LLM calls, schedules 1 job
    r1 = tc.get("/api/ask?q=How%20did%20the%20Winter%20War%20end%3F")
    assert r1.status_code == 200
    d1 = r1.json()
    assert d1["pending"] is True
    assert d1["history_available"] is True
    assert d1["milestones"] == []
    assert d1["top"] == {"lang": "fi", "page_id": 52097}
    assert "Preparing an answer" in d1["answer"]
    assert "Moskovan rauhansopimus solmittiin 12. maaliskuuta 1940." in d1["answer"]
    assert len(client.recorded_calls) == 0
    assert len(scheduled) == 1

    # 3. Second miss before worker runs (with slightly different whitespace/case) -> single-flight dedupes!
    r2 = tc.get("/api/ask?q=how+did+the+winter+war+end")
    assert r2.status_code == 200
    assert r2.json()["pending"] is True
    assert len(scheduled) == 1

    # 4. Run background worker -> builds & writes answer_cache
    func, args = scheduled[0]
    func(*args)
    assert len(client.recorded_calls) == 3

    # 5. Next request hits cache: pending=False, ZERO embed or LLM calls
    prev_embeds = embed_calls["n"]
    prev_llms = len(client.recorded_calls)
    r3 = tc.get("/api/ask?q=How%20did%20the%20Winter%20War%20end")
    assert r3.status_code == 200
    d3 = r3.json()
    assert d3["pending"] is False
    assert d3["history_available"] is True
    assert d3["top"] == {"lang": "fi", "page_id": 52097}
    assert len(d3["milestones"]) == 2
    assert d3["milestones"][0]["rev_id"] == 412098
    assert d3["facts"][0]["url"] == "https://fi.wikipedia.org/w/index.php?oldid=22491034"
    assert embed_calls["n"] == prev_embeds
    assert len(client.recorded_calls) == prev_llms


def test_build_and_cache_ask_no_history():
    store = _sample_store(with_history=False)
    ask._cache_table_ready = False
    client = _make_fake_llm_client(
        [
            {
                "found": True,
                "answer": "Carl Ludvig Engel was a German-Finnish architect [1].",
                "facts": [
                    {
                        "text": "German-Finnish architect",
                        "source_sentence": "Carl Ludvig Engel var en tysk-finländsk arkitekt.",
                        "n": 1,
                    }
                ],
            }
        ]
    )
    payload, stats = ask.build_and_cache_ask(
        q="Who was Carl Ludvig Engel?",
        force=True,
        rag_opener=lambda: FakeConnection(store),
        llm_client=client,
        embed_fn=lambda texts: ([[0.5, 0.5]], 4),
    )
    assert payload["history_available"] is False
    assert payload["milestones"] == []
    assert payload["pending"] is False
    assert payload["top"] == {"lang": "sv", "page_id": 18112}
    assert len(payload["facts"]) == 1
    assert payload["facts"][0]["url"] == "https://sv.wikipedia.org/w/index.php?oldid=555000"
    assert stats.total_llm_calls == 1
    assert stats.wrote_cache is True


def test_single_statement_join_matches_history_as_of_oracle():
    """Verify Way A SQL join matches history.as_of() oracle on page 52097 at 3 timestamps."""
    try:
        rag_con = rag_common.connect()
        svt_con = svt_common.connect()
    except mariadb.Error as exc:
        pytest.skip(f"Live MariaDB not reachable locally: {exc}")

    try:
        rc = rag_con.cursor()
        sc = svt_con.cursor()
        rc.execute("SET time_zone = '+00:00'")
        rc.execute(f"SET mhnsw_ef_search = {rag_common.EF_SEARCH}")
        sc.execute("SET time_zone = '+00:00'")

        rc.execute(
            "SELECT VEC_ToText(embedding) FROM wikirag.chunk_vector WHERE lang = 'fi' AND page_id = 52097 LIMIT 1"
        )
        row = rc.fetchone()
        assert row is not None, "Expected chunks for page_id=52097 in wikirag.chunk_vector"
        vec_text = str(row[0])

        for ts in ("2006-12-31 23:59:59", "2012-12-31 23:59:59", "2020-12-31 23:59:59"):
            oracle = history.as_of(sc, 52097, ts)
            assert oracle is not None
            rc.execute(ask.SINGLE_STMT_HISTORY_SQL, (vec_text, ts, 52097))
            got_rows = rc.fetchall()
            assert got_rows, f"Single-statement join returned no rows for 52097 at {ts}"
            cols = [d[0] for d in rc.description]
            rev_idx = cols.index("rev_id")
            assert int(got_rows[0][rev_idx]) == int(oracle["rev_id"])
    finally:
        rag_con.close()
        svt_con.close()
