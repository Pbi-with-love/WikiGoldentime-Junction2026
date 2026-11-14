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
        if s.upper().startswith("SET TIME_ZONE"):
            self.description = []
            self._rows = []
            return
        if "FROM wikihistory.article FOR SYSTEM_TIME ALL" in s and "BETWEEN" not in s and "AS is_revert" in s:
            pid = params[0]
            versions = self._get_fake_versions(pid)
            cols = ["rev_id", "row_start", "user", "comment", "len", "is_revert", "undid_anonymous"]
            self.description = [(c,) for c in cols]
            self._rows = [
                (
                    v["rev_id"],
                    v["row_start"],
                    v["user"],
                    v["comment"],
                    len(v["text"]),
                    v["is_revert"],
                    False,
                )
                for v in versions
            ]
            return
        if "FROM wikihistory.article FOR SYSTEM_TIME ALL" in s and "row_start BETWEEN ? AND ?" in s:
            pid, start_ts, end_ts = params
            start_dt = datetime.strptime(str(start_ts), "%Y-%m-%d %H:%M:%S")
            end_dt = datetime.strptime(str(end_ts), "%Y-%m-%d %H:%M:%S")
            versions = [
                v for v in self._get_fake_versions(pid)
                if start_dt <= v["row_start"] <= end_dt
            ]
            cols = ["rev_id", "row_start", "user", "comment", "sha1", "text"]
            self.description = [(c,) for c in cols]
            self._rows = [
                (v["rev_id"], v["row_start"], v["user"], v["comment"], v["sha1"], v["text"])
                for v in versions
            ]
            return
        raise AssertionError(f"Unhandled fake SQL: {s}")

    def _get_fake_versions(self, pid: int) -> list[dict[str, Any]]:
        if "history_versions" in self.store and pid in self.store["history_versions"]:
            return list(self.store["history_versions"][pid])
        snaps = self.store["history_snapshots"].get(pid, {})
        by_rev: dict[int, dict[str, Any]] = {}
        for snap in snaps.values():
            rid = int(snap["rev_id"])
            if rid not in by_rev or snap["row_start"] < by_rev[rid]["row_start"]:
                by_rev[rid] = dict(snap)
        ordered = sorted(by_rev.values(), key=lambda r: r["row_start"])
        seen_sha1s: set[str] = set()
        prev_sha1: str | None = None
        out: list[dict[str, Any]] = []
        for item in ordered:
            sha1 = hashlib.sha1(str(item["text"]).encode("utf-8")).hexdigest()
            is_rev = sha1 != prev_sha1 and sha1 in seen_sha1s
            seen_sha1s.add(sha1)
            prev_sha1 = sha1
            out.append({**item, "sha1": sha1, "is_revert": is_rev})
        return out

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


def _make_snap(year: int, rev_id: int, row_start: str, user: str = "U", comment: str = "c") -> dict[str, Any]:
    return {
        "year": year,
        "rev_id": rev_id,
        "user": user,
        "comment": comment,
        "row_start": row_start,
        "url": f"https://fi.wikipedia.org/w/index.php?oldid={rev_id}",
    }


def _make_ver(
    rev_id: int,
    row_start: str,
    text: str,
    *,
    sha1: str | None = None,
    is_revert: bool = False,
    user: str = "Ed",
    comment: str = "edit",
) -> dict[str, Any]:
    digest = sha1 or hashlib.sha1(text.encode("utf-8")).hexdigest()
    return {
        "rev_id": rev_id,
        "row_start": row_start,
        "user": user,
        "comment": comment,
        "sha1": digest,
        "text": text,
        "is_revert": is_revert,
    }


def test_sentence_key_and_all_not_found_milestones():
    assert ask.sentence_key(False, [{"source_sentence": "Ignored"}]) == frozenset()
    assert ask.sentence_key(
        True,
        [
            {"source_sentence": "Rauha  solmittiin\n1940."},
            {"source_sentence": "Suomi menetti Karjalan."},
        ],
    ) == frozenset({"Rauha solmittiin 1940.", "Suomi menetti Karjalan."})

    snaps = [
        _make_snap(2004, 100, "2004-05-01T10:00:00Z", "A", "init"),
        _make_snap(2005, 101, "2005-06-01T10:00:00Z", "B", "typo"),
    ]
    called = [
        {**snaps[0], "found": False, "answer": ask.NO_ANSWER_MILESTONE_TEXT, "facts": []},
        {**snaps[1], "found": False, "answer": ask.NO_ANSWER_MILESTONE_TEXT, "facts": []},
    ]
    scans_called = 0

    def fail_if_called(_p, _c):
        nonlocal scans_called
        scans_called += 1
        return []

    ms = ask.build_milestones(snaps, called, fail_if_called)
    assert scans_called == 0
    assert len(ms) == 1
    assert (ms[0]["from_year"], ms[0]["to_year"], ms[0]["found"], ms[0]["rev_id"]) == (2004, 2005, False, 100)
    assert ms[0]["changed_by"] is None
    assert ms[0]["answer"] == ask.NO_ANSWER_MILESTONE_TEXT
    assert ms[0]["facts"] == []


def test_a5_same_sentence_key_different_english_merges_verbatim():
    snaps = [
        _make_snap(2006, 200, "2006-12-31T20:00:00Z", "A", "edit1"),
        _make_snap(2009, 300, "2009-12-31T20:00:00Z", "B", "edit2"),
    ]
    called = [
        {
            **snaps[0],
            "found": True,
            "answer": "Signed on 12 March 1940.",
            "facts": [
                {
                    "text": "Signed 12 March 1940",
                    "source_sentence": "Moskovan rauhansopimus allekirjoitettiin illalla 12. maaliskuuta 1940.",
                }
            ],
        },
        {
            **snaps[1],
            "found": True,
            "answer": "Completely rephrased English wording about evening of 12 March 1940.",
            "facts": [
                {
                    "text": "Evening of 12 March 1940",
                    "source_sentence": "Moskovan  rauhansopimus\nallekirjoitettiin illalla 12. maaliskuuta 1940.",
                }
            ],
        },
    ]
    stats = ask.AskBuildStats(
        q="Test", q_hash="h", top_lang="fi", top_page_id=1,
        history_available=True, history_resolution="direct", sql_mode="single_stmt",
    )
    ms = ask.build_milestones(snaps, called, lambda _p, _c: [], stats=stats)
    assert len(ms) == 1
    assert (ms[0]["from_year"], ms[0]["to_year"]) == (2006, 2009)
    assert ms[0]["changed_by"] is None
    assert ms[0]["answer"] == "Signed on 12 March 1940."
    assert ms[0]["facts"][0]["text"] == "Signed 12 March 1940"
    assert stats.windows_scanned == 0


def test_a5_real_replacement_in_skipped_cap_year_sets_changed_by_and_snapshot():
    # Cap skipped 2006: called years are 2005 and 2007, while the real edit happened in 2006.
    sent_a = "Se astui voimaan 13. maaliskuuta 1940."
    sent_a_prime = "Moskovan rauhansopimus allekirjoitettiin illalla 12. maaliskuuta 1940."
    snaps = [
        _make_snap(2005, 500, "2005-12-31T19:00:00Z", "U2005", "s2005"),
        _make_snap(2006, 650, "2006-12-29T18:00:00Z", "U2006", "s2006"),
        _make_snap(2007, 700, "2007-12-28T12:00:00Z", "U2007", "s2007"),
    ]
    called = [
        {
            **snaps[0],
            "found": True,
            "answer": "13 March 1940.",
            "facts": [{"text": "13 March 1940", "source_sentence": sent_a}],
        },
        {
            **snaps[2],
            "found": True,
            "answer": "Evening of 12 March 1940.",
            "facts": [{"text": "Evening of 12 March 1940", "source_sentence": sent_a_prime}],
        },
    ]
    window_versions = [
        _make_ver(500, "2005-12-31T19:00:00Z", f"== Rauha ==\n{sent_a}"),
        _make_ver(600, "2006-05-01T10:00:00Z", f"== Rauha ==\n{sent_a} Lisäys."),
        _make_ver(610, "2006-11-07T21:36:39Z", f"== Rauha ==\n{sent_a_prime}", user="Whiskey~fiwiki", comment="siistintää"),
        _make_ver(650, "2006-12-29T18:00:00Z", f"== Rauha ==\n{sent_a_prime} Muu."),
        _make_ver(700, "2007-12-28T12:00:00Z", f"== Rauha ==\n{sent_a_prime} Muu."),
    ]
    stats = ask.AskBuildStats(
        q="Test", q_hash="h", top_lang="fi", top_page_id=1,
        history_available=True, history_resolution="direct", sql_mode="single_stmt",
    )
    ms = ask.build_milestones(snaps, called, lambda _p, _c: window_versions, stats=stats)
    assert len(ms) == 2
    assert ms[0]["changed_by"] is None
    assert (ms[0]["from_year"], ms[0]["to_year"], ms[0]["rev_id"]) == (2005, 2005, 500)
    assert (ms[1]["from_year"], ms[1]["to_year"], ms[1]["rev_id"]) == (2006, 2007, 650)
    assert ms[1]["user"] == "U2006"
    assert ms[1]["url"] == "https://fi.wikipedia.org/w/index.php?oldid=650"
    assert ms[1]["facts"][0]["url"] == "https://fi.wikipedia.org/w/index.php?oldid=650"
    assert ms[1]["changed_by"] == {
        "rev_id": 610,
        "row_start": "2006-11-07T21:36:39Z",
        "user": "Whiskey~fiwiki",
        "comment": "siistintää",
        "url": "https://fi.wikipedia.org/w/index.php?oldid=610",
    }
    assert stats.windows_scanned == 1
    assert stats.reverted_later == 0


def test_a5_vandalism_and_revert_keeps_original_origin():
    sent_a = "Rauha solmittiin 13. maaliskuuta 1940."
    sent_a_prime = "Rauha solmittiin illalla 12. maaliskuuta 1940."
    snaps = [
        _make_snap(2005, 500, "2005-12-31T19:00:00Z"),
        _make_snap(2006, 650, "2006-12-29T18:00:00Z"),
    ]
    called = [
        {**snaps[0], "found": True, "answer": "13 March.", "facts": [{"text": "13 March", "source_sentence": sent_a}]},
        {**snaps[1], "found": True, "answer": "12 March.", "facts": [{"text": "12 March", "source_sentence": sent_a_prime}]},
    ]
    txt_good = f"== Rauha ==\n{sent_a_prime}"
    txt_vandal = "== Rauha ==\nSotatila jatkui."
    sha_good = hashlib.sha1(txt_good.encode("utf-8")).hexdigest()
    window_versions = [
        _make_ver(500, "2005-12-31T19:00:00Z", f"== Rauha ==\n{sent_a}"),
        _make_ver(610, "2006-11-07T21:36:39Z", txt_good, sha1=sha_good, user="Whiskey~fiwiki", comment="fix"),
        _make_ver(611, "2006-11-08T01:00:00Z", txt_vandal, user="Vandal", comment="blank"),
        _make_ver(612, "2006-11-08T01:01:00Z", txt_good, sha1=sha_good, is_revert=True, user="Patrol", comment="rv"),
        _make_ver(650, "2006-12-29T18:00:00Z", txt_good + " Lisää.", is_revert=False),
    ]
    stats = ask.AskBuildStats(
        q="Test", q_hash="h", top_lang="fi", top_page_id=1,
        history_available=True, history_resolution="direct", sql_mode="single_stmt",
    )
    ms = ask.build_milestones(snaps, called, lambda _p, _c: window_versions, stats=stats)
    assert len(ms) == 2
    assert ms[1]["changed_by"]["rev_id"] == 610
    assert ms[1]["changed_by"]["user"] == "Whiskey~fiwiki"
    assert stats.reverted_later == 1


def test_a5_change_undone_inside_window_is_ignored_with_reverted_later_one():
    sent_a = "Rauha solmittiin 13. maaliskuuta 1940."
    sent_temp = "Rauha solmittiin 12. maaliskuuta 1940."
    snaps = [
        _make_snap(2004, 100, "2004-01-01T00:00:00Z"),
        _make_snap(2005, 200, "2005-01-01T00:00:00Z"),
    ]
    called = [
        {**snaps[0], "found": True, "answer": "13 March.", "facts": [{"text": "13 March", "source_sentence": sent_a}]},
        {**snaps[1], "found": True, "answer": "12 March?", "facts": [{"text": "12 March", "source_sentence": sent_temp}]},
    ]
    txt_a = f"== Rauha ==\n{sent_a}"
    sha_a = hashlib.sha1(txt_a.encode("utf-8")).hexdigest()
    window_versions = [
        _make_ver(100, "2004-01-01T00:00:00Z", txt_a, sha1=sha_a),
        _make_ver(123, "2004-03-26T10:00:00Z", f"== Rauha ==\n{sent_temp}"),
        _make_ver(130, "2004-07-10T10:00:00Z", txt_a, sha1=sha_a, is_revert=True),
        _make_ver(200, "2005-01-01T00:00:00Z", txt_a, sha1=sha_a),
    ]
    stats = ask.AskBuildStats(
        q="Test", q_hash="h", top_lang="fi", top_page_id=1,
        history_available=True, history_resolution="direct", sql_mode="single_stmt",
    )
    ms = ask.build_milestones(snaps, called, lambda _p, _c: window_versions, stats=stats)
    assert len(ms) == 1
    assert ms[0]["changed_by"] is None
    assert ms[0]["answer"] == "13 March."
    assert (ms[0]["from_year"], ms[0]["to_year"]) == (2004, 2005)
    assert stats.reverted_later == 1


def test_a5_sentence_already_in_first_window_version_gives_no_milestone():
    sent_1 = "Rauha allekirjoitettiin 12. maaliskuuta 1940."
    sent_2 = "Taistelut päättyivät seuraavana päivänä klo 11."
    snaps = [
        _make_snap(2006, 100, "2006-12-31T00:00:00Z"),
        _make_snap(2009, 200, "2009-12-31T00:00:00Z"),
    ]
    called = [
        {**snaps[0], "found": True, "answer": "Signed 12 March.", "facts": [{"text": "Signed 12 March", "source_sentence": sent_1}]},
        {
            **snaps[1],
            "found": True,
            "answer": "Signed 12 March and fighting ended at 11.",
            "facts": [
                {"text": "Signed 12 March", "source_sentence": sent_1},
                {"text": "Fighting ended at 11", "source_sentence": sent_2},
            ],
        },
    ]
    both_text = f"== Rauha ==\n{sent_1} {sent_2}"
    window_versions = [
        _make_ver(100, "2006-12-31T00:00:00Z", both_text),
        _make_ver(200, "2009-12-31T00:00:00Z", both_text),
    ]
    ms = ask.build_milestones(snaps, called, lambda _p, _c: window_versions)
    assert len(ms) == 1
    assert ms[0]["changed_by"] is None
    assert ms[0]["answer"] == "Signed 12 March."
    assert len(ms[0]["facts"]) == 1
    assert (ms[0]["from_year"], ms[0]["to_year"]) == (2006, 2009)


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
    assert d3["milestones"][0]["changed_by"] is None
    assert d3["milestones"][1]["changed_by"]["rev_id"] == 999111
    assert "oldid=999111" in d3["milestones"][1]["changed_by"]["url"]
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


def test_a5_edge_cases_clamping_found_transitions_and_missing_origin():
    # 1. Edit in same UTC year as P's year-end snapshot (after snapshot timestamp) clamps to P_year + 1.
    snaps = [
        _make_snap(2005, 100, "2005-12-31T19:00:00Z"),
        _make_snap(2006, 200, "2006-12-31T19:00:00Z"),
    ]
    called = [
        {**snaps[0], "found": False, "answer": ask.NO_ANSWER_MILESTONE_TEXT, "facts": []},
        {**snaps[1], "found": True, "answer": "Added late 2005.", "facts": [{"text": "Added", "source_sentence": "Uusi lause 1940."}]},
    ]
    vers_clamp = [
        _make_ver(100, "2005-12-31T19:00:00Z", "Vanha teksti."),
        _make_ver(101, "2005-12-31T21:00:00Z", "Uusi lause 1940."),
        _make_ver(200, "2006-12-31T19:00:00Z", "Uusi lause 1940."),
    ]
    ms_clamp = ask.build_milestones(snaps, called, lambda _p, _c: vers_clamp)
    assert len(ms_clamp) == 2
    assert (ms_clamp[0]["from_year"], ms_clamp[0]["to_year"]) == (2005, 2005)
    assert (ms_clamp[1]["from_year"], ms_clamp[1]["to_year"]) == (2006, 2006)
    assert ms_clamp[1]["changed_by"]["rev_id"] == 101

    # 2. found=False -> found=True when sentence already existed in P's snapshot -> stays found=False.
    vers_already = [
        _make_ver(100, "2005-12-31T19:00:00Z", "Uusi lause 1940."),
        _make_ver(200, "2006-12-31T19:00:00Z", "Uusi lause 1940."),
    ]
    ms_miss = ask.build_milestones(snaps, called, lambda _p, _c: vers_already)
    assert len(ms_miss) == 1
    assert ms_miss[0]["found"] is False
    assert ms_miss[0]["answer"] == ask.NO_ANSWER_MILESTONE_TEXT

    # 3. found=True -> found=False when sentence is removed in window -> confirms deletion rev.
    called_del = [
        {**snaps[0], "found": True, "answer": "Present.", "facts": [{"text": "Present", "source_sentence": "Poistettava lause."}]},
        {**snaps[1], "found": False, "answer": ask.NO_ANSWER_MILESTONE_TEXT, "facts": []},
    ]
    vers_del = [
        _make_ver(100, "2005-12-31T19:00:00Z", "Poistettava lause. Muu."),
        _make_ver(150, "2006-03-15T10:00:00Z", "Muu."),
        _make_ver(200, "2006-12-31T19:00:00Z", "Muu."),
    ]
    ms_del = ask.build_milestones(snaps, called_del, lambda _p, _c: vers_del)
    assert len(ms_del) == 2
    assert ms_del[1]["found"] is False
    assert ms_del[1]["changed_by"]["rev_id"] == 150

    # 4. Empty window fallback per A3: counts change at C's year with changed_by=None.
    ms_empty = ask.build_milestones(snaps, called, lambda _p, _c: [])
    assert len(ms_empty) == 2
    assert ms_empty[1]["from_year"] == 2006
    assert ms_empty[1]["changed_by"] is None


def test_a5_dropped_still_present_elsewhere_but_new_appears_confirms():
    sent_old = "Suomi luovutti Hangon tukikohdaksi toisessa osiossa."
    sent_shared = "Moskovan rauhansopimus päätti talvisodan."
    sent_new = "Moskovan rauhansopimus allekirjoitettiin illalla 12. maaliskuuta 1940."
    snaps = [
        _make_snap(2005, 500, "2005-12-31T19:00:00Z"),
        _make_snap(2006, 650, "2006-12-29T18:00:00Z"),
        _make_snap(2007, 700, "2007-12-28T12:00:00Z"),
    ]
    called = [
        {
            **snaps[0],
            "found": True,
            "answer": "1940.",
            "facts": [
                {"text": "Shared", "source_sentence": sent_shared},
                {"text": "Hanko", "source_sentence": sent_old},
            ],
        },
        {
            **snaps[2],
            "found": True,
            "answer": "12 March 1940.",
            "facts": [
                {"text": "Shared", "source_sentence": sent_shared},
                {"text": "12 March", "source_sentence": sent_new},
            ],
        },
    ]
    window_versions = [
        _make_ver(500, "2005-12-31T19:00:00Z", f"== Rauha ==\n{sent_shared}\n== Tappiot ==\n{sent_old}"),
        _make_ver(610, "2006-11-07T21:36:39Z", f"== Rauha ==\n{sent_shared} {sent_new}\n== Tappiot ==\n{sent_old}", user="Whiskey~fiwiki"),
        _make_ver(700, "2007-12-28T12:00:00Z", f"== Rauha ==\n{sent_shared} {sent_new}\n== Tappiot ==\n{sent_old}"),
    ]
    ms = ask.build_milestones(snaps, called, lambda _p, _c: window_versions)
    assert len(ms) == 2
    assert (ms[0]["from_year"], ms[0]["to_year"]) == (2005, 2005)
    assert (ms[1]["from_year"], ms[1]["to_year"], ms[1]["rev_id"]) == (2006, 2007, 650)
    assert ms[1]["changed_by"]["rev_id"] == 610
    assert ms[1]["changed_by"]["row_start"] == "2006-11-07T21:36:39Z"


def test_a5_new_empty_dropped_removed_confirms():
    sent_keep = "Talvisota päättyi maaliskuussa 1940."
    sent_removed = "Vanhentunut väite sopimuksesta."
    snaps = [
        _make_snap(2005, 500, "2005-12-31T19:00:00Z"),
        _make_snap(2006, 650, "2006-12-29T18:00:00Z"),
        _make_snap(2007, 700, "2007-12-28T12:00:00Z"),
    ]
    called = [
        {
            **snaps[0],
            "found": True,
            "answer": "Both.",
            "facts": [
                {"text": "Keep", "source_sentence": sent_keep},
                {"text": "Old", "source_sentence": sent_removed},
            ],
        },
        {
            **snaps[2],
            "found": True,
            "answer": "Keep only.",
            "facts": [{"text": "Keep", "source_sentence": sent_keep}],
        },
    ]
    vers_removed = [
        _make_ver(500, "2005-12-31T19:00:00Z", f"== Rauha ==\n{sent_keep} {sent_removed}"),
        _make_ver(620, "2006-05-01T10:00:00Z", f"== Rauha ==\n{sent_keep}", user="EditorA"),
        _make_ver(700, "2007-12-28T12:00:00Z", f"== Rauha ==\n{sent_keep}"),
    ]
    ms = ask.build_milestones(snaps, called, lambda _p, _c: vers_removed)
    assert len(ms) == 2
    assert (ms[1]["from_year"], ms[1]["to_year"], ms[1]["rev_id"]) == (2006, 2007, 650)
    assert ms[1]["changed_by"]["rev_id"] == 620

    # When new is empty and dropped sentence was NOT actually deleted from article, stays unconfirmed.
    vers_not_removed = [
        _make_ver(500, "2005-12-31T19:00:00Z", f"== Rauha ==\n{sent_keep} {sent_removed}"),
        _make_ver(700, "2007-12-28T12:00:00Z", f"== Rauha ==\n{sent_keep} {sent_removed}"),
    ]
    ms_kept = ask.build_milestones(snaps, called, lambda _p, _c: vers_not_removed)
    assert len(ms_kept) == 1
    assert (ms_kept[0]["from_year"], ms_kept[0]["to_year"]) == (2005, 2007)


def test_a5_rewording_with_same_numbers_merges_to_one_milestone():
    sent_2006 = "Sodan päätteeksi Suomi menetti 10 prosenttia alueistaan 12. maaliskuuta 1940."
    sent_2009 = "Sota päättyi 12. maaliskuuta 1940 sopimukseen, jossa Suomi luovutti 10 prosenttia maa-alueistaan."
    snaps = [
        _make_snap(2006, 200, "2006-12-29T18:00:00Z"),
        _make_snap(2009, 300, "2009-12-20T16:00:00Z"),
    ]
    called = [
        {**snaps[0], "found": True, "answer": "Lost 10% on 12 March 1940.", "facts": [{"text": "10% ceded", "source_sentence": sent_2006}]},
        {**snaps[1], "found": True, "answer": "Ceded 10% on 12 March 1940.", "facts": [{"text": "10% lost", "source_sentence": sent_2009}]},
    ]
    scans = 0

    def fetch_win(_p, _c):
        nonlocal scans
        scans += 1
        return [
            _make_ver(200, "2006-12-29T18:00:00Z", sent_2006),
            _make_ver(250, "2007-10-28T08:29:11Z", sent_2009),
            _make_ver(300, "2009-12-20T16:00:00Z", sent_2009),
        ]

    ms = ask.build_milestones(snaps, called, fetch_win)
    assert len(ms) == 1
    assert (ms[0]["from_year"], ms[0]["to_year"], ms[0]["rev_id"]) == (2006, 2009, 200)
    assert ms[0]["changed_by"] is None
    assert scans == 0


def test_a5_new_number_and_reworded_in_window_uses_number_origin():
    sent_2005 = "Se astui voimaan 13. maaliskuuta 1940."
    sent_2005_pct = "Sodan päätteeksi Suomi menetti 10 prosenttia alueistaan."
    sent_2006_new_num = "Moskovan rauhansopimus allekirjoitettiin illalla 12. maaliskuuta 1940."
    sent_2007_reword = "Sota päättyi Moskovan rauhansopimukseen, jossa Suomi luovutti 10 prosenttia maa-alueistaan."
    snaps = [
        _make_snap(2005, 500, "2005-12-31T19:00:00Z"),
        _make_snap(2006, 650, "2006-12-29T18:00:00Z"),
        _make_snap(2007, 750, "2007-12-28T12:00:00Z"),
    ]
    called = [
        {
            **snaps[0],
            "found": True,
            "answer": "13 March 1940.",
            "facts": [
                {"text": "13 March", "source_sentence": sent_2005},
                {"text": "10% lost", "source_sentence": sent_2005_pct},
            ],
        },
        {
            **snaps[2],
            "found": True,
            "answer": "12 March 1940 and 10%.",
            "facts": [
                {"text": "12 March", "source_sentence": sent_2006_new_num},
                {"text": "10% ceded", "source_sentence": sent_2007_reword},
            ],
        },
    ]
    vers = [
        _make_ver(500, "2005-12-31T19:00:00Z", f"{sent_2005} {sent_2005_pct}"),
        _make_ver(610, "2006-11-07T21:36:39Z", f"{sent_2006_new_num} {sent_2005_pct}", user="Whiskey~fiwiki"),
        _make_ver(650, "2006-12-29T18:00:00Z", f"{sent_2006_new_num} {sent_2005_pct}"),
        _make_ver(710, "2007-10-28T08:29:11Z", f"{sent_2006_new_num} {sent_2007_reword}", user="Jontts"),
        _make_ver(750, "2007-12-28T12:00:00Z", f"{sent_2006_new_num} {sent_2007_reword}"),
    ]
    ms = ask.build_milestones(snaps, called, lambda _p, _c: vers)
    assert len(ms) == 2
    assert (ms[0]["from_year"], ms[0]["to_year"]) == (2005, 2005)
    assert (ms[1]["from_year"], ms[1]["to_year"], ms[1]["rev_id"]) == (2006, 2007, 650)
    assert ms[1]["changed_by"]["rev_id"] == 610
    assert ms[1]["changed_by"]["row_start"] == "2006-11-07T21:36:39Z"


def _pick_treaty_date_sentence(wikitext: str) -> str:
    cleaned = ask.format_cleaned_blocks(history.clean(wikitext))
    matches = [
        summary.normalize_ws(sent)
        for sent in summary.extract_prose_sentences(cleaned)
        if "maaliskuuta 1940" in sent
        and ("rauhansopimus" in sent.lower() or "voimaan" in sent.lower())
    ]
    assert len(matches) == 1, f"Expected unique treaty date sentence, found: {matches}"
    return matches[0]


def test_a6_pinned_talvisota_1862876_on_live_3307():
    """Verify A2 window scan on real Talvisota (1256) history in MariaDB 3307 (no LLM)."""
    try:
        con = rag_common.connect()
    except mariadb.Error as exc:
        pytest.skip(f"Live MariaDB not reachable locally: {exc}")

    try:
        cur = con.cursor()
        try:
            cur.execute("SET time_zone = '+00:00'")
            asof_2005 = history.as_of(cur, 1256, "2005-12-31 23:59:59", table="wikihistory.article")
            asof_2006 = history.as_of(cur, 1256, "2006-12-31 23:59:59", table="wikihistory.article")
            asof_2021 = history.as_of(cur, 1256, "2021-12-31 23:59:59", table="wikihistory.article")
            assert asof_2005 is not None and asof_2006 is not None and asof_2021 is not None

            sent_2005 = _pick_treaty_date_sentence(str(asof_2005["text"]))
            sent_2006 = _pick_treaty_date_sentence(str(asof_2006["text"]))
            print(f"\n[A6] 2005 sentence: {sent_2005}")
            print(f"[A6] 2006 sentence: {sent_2006}")
            assert sent_2005 != sent_2006

            vers_meta = history.versions(cur, 1256, table="wikihistory.article")
            is_revert_map = {int(v["rev_id"]): bool(v["is_revert"]) for v in vers_meta}

            def fetch_win(p_snap: dict[str, Any], c_snap: dict[str, Any]) -> list[dict[str, Any]]:
                return ask._fetch_window_versions_from_db(
                    cur, 1256, p_snap["row_start"], c_snap["row_start"], is_revert_map
                )

            snap_2005 = _make_snap(2005, int(asof_2005["rev_id"]), ask._iso_utc(asof_2005["row_start"]), str(asof_2005["user"] or ""), str(asof_2005["comment"] or ""))
            snap_2006 = _make_snap(2006, int(asof_2006["rev_id"]), ask._iso_utc(asof_2006["row_start"]), str(asof_2006["user"] or ""), str(asof_2006["comment"] or ""))
            snap_2021 = _make_snap(2021, int(asof_2021["rev_id"]), ask._iso_utc(asof_2021["row_start"]), str(asof_2021["user"] or ""), str(asof_2021["comment"] or ""))

            ms_05_06 = ask.build_milestones(
                [snap_2005, snap_2006],
                [
                    {**snap_2005, "found": True, "answer": "13 March 1940.", "facts": [{"text": "13 March", "source_sentence": sent_2005}]},
                    {**snap_2006, "found": True, "answer": "12 March 1940.", "facts": [{"text": "12 March", "source_sentence": sent_2006}]},
                ],
                fetch_win,
            )
            assert len(ms_05_06) == 2
            changed = ms_05_06[1]["changed_by"]
            print(f"[A6] 2005->2006 changed_by: {changed}")
            assert changed is not None
            assert changed["rev_id"] == 1862876
            assert changed["row_start"].startswith("2006-11-07")

            # Check 2006 -> 2021 scan for removal of the 2006 treaty sentence: collapses vandalism reverts, no change.
            win_06_21 = fetch_win(snap_2006, snap_2021)
            scan_06_21 = ask.scan_change_window(win_06_21, frozenset(), frozenset({sent_2006}))
            print(
                f"[A6] 2006->2021 scan: confirmed={scan_06_21.confirmed} "
                f"versions={scan_06_21.versions_read} sha1_cleaned={scan_06_21.sha1_cleaned} "
                f"reverted_later={scan_06_21.reverted_later}"
            )
            assert scan_06_21.confirmed is False
            assert scan_06_21.changed_by_version is None
            assert scan_06_21.reverted_later >= 1
        finally:
            cur.close()
    finally:
        con.close()
