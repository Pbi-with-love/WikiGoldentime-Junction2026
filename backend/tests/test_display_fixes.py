"""Unit tests for spec 014 display fixes (HTML entity unescaping in asof/diff)."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend import history, main  # noqa: E402


class _FakeCursor:
    def close(self) -> None:
        pass


class _FakeConn:
    def cursor(self) -> _FakeCursor:
        return _FakeCursor()

    def close(self) -> None:
        pass


def test_clean_blocks_unescapes_html_entities():
    wikitext = "30. marraskuuta&nbsp;1939 &ndash; 13. maaliskuuta&amp;loppu &lt;script&gt;"
    blocks = main._clean_blocks(wikitext)
    assert blocks == [
        ("p", "30. marraskuuta\u00a01939 \u2013 13. maaliskuuta&loppu <script>")
    ]
    _, txt = blocks[0]
    assert "&ndash;" not in txt
    assert "&nbsp;" not in txt
    assert "&amp;" not in txt


def test_get_asof_unescapes_blocks_without_db(monkeypatch):
    fake_row = {
        "title": "Talvisota",
        "rev_id": 123456,
        "user": "TestUser",
        "comment": "2006 snapshot",
        "row_start": datetime(2006, 12, 1, 10, 0, 0, tzinfo=timezone.utc),
        "row_end": datetime(2007, 1, 1, 10, 0, 0, tzinfo=timezone.utc),
        "text": "== Sodan kulku ==\n30. marraskuuta 1939 &ndash; 13. maaliskuuta 1940.",
    }
    monkeypatch.setattr(main, "_open_svt", lambda: _FakeConn())
    monkeypatch.setattr(history, "as_of", lambda cur, page_id, moment: fake_row)

    res = main.get_asof(1256, "2006-12-31")
    assert set(res.keys()) == {"title", "rev_id", "user", "comment", "row_start", "row_end", "blocks"}
    assert res["blocks"] == [
        ["h", "Sodan kulku"],
        ["p", "30. marraskuuta 1939 \u2013 13. maaliskuuta 1940."],
    ]
    joined = " ".join(txt for _, txt in res["blocks"])
    assert "\u2013" in joined
    assert "&ndash;" not in joined


def test_get_diff_unescapes_blocks_without_db(monkeypatch):
    old_row = {"text": "30. marraskuuta&nbsp;1939 &ndash; 13. maaliskuuta 1940."}
    new_row = {"text": "30. marraskuuta&nbsp;1939 &ndash; 13. maaliskuuta 1940 &amp; rauha."}
    monkeypatch.setattr(main, "_open_svt", lambda: _FakeConn())
    monkeypatch.setattr(
        main,
        "_resolve_diff_side",
        lambda cur, page_id, param: old_row if param == "1" else new_row,
    )

    res = main.get_diff(1256, from_param="1", to_param="2")
    assert list(res.keys()) == ["parts"]
    assert len(res["parts"]) == 1
    part = res["parts"][0]
    assert part["op"] == "edit"
    rendered = "".join(w["text"] for w in part["words"])
    assert "\u2013" in rendered
    assert "\u00a0" in rendered
    assert "& rauha." in rendered
    assert "&ndash;" not in rendered
    assert "&nbsp;" not in rendered
    assert "&amp;" not in rendered
