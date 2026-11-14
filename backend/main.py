"""FastAPI core backend for wikimemory (stars, search, article, timeline, asof, diff)."""

from __future__ import annotations

import contextvars
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import difflib
from functools import lru_cache
import gc
import html
import json
import logging
import math
import os
from pathlib import Path
import re
import sys
import threading
import time
from typing import Any
import urllib.parse

from fastapi import BackgroundTasks, FastAPI, HTTPException, Query, Request, Response
from fastapi.staticfiles import StaticFiles
import mariadb
from starlette.middleware.gzip import GZipMiddleware

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

# Ensure SVT defaults to the merged 3307 server unless explicitly overridden.
os.environ.setdefault("DB_PORT", "3307")

from backend import ask, compare, history, rag_common, road, summary, svt_common, threads  # noqa: E402

if svt_common.DB["port"] == 3308 and os.environ.get("DB_PORT") != "3308":
    svt_common.DB["port"] = int(os.environ.get("SVT_DB_PORT", 3307))
elif "SVT_DB_PORT" in os.environ:
    svt_common.DB["port"] = int(os.environ["SVT_DB_PORT"])

logger = logging.getLogger("uvicorn.error")

VALID_LANGS = ("fi", "sv", "en")
DIST_DIR = REPO_ROOT / "dist"
_REV_ID_RE = re.compile(r"^\d+$")
_YEAR_RE = re.compile(r"^\d{4}$")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_DATETIME_RE = re.compile(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$")

STARS_SQL = r"""
SELECT
    a.lang,
    a.page_id,
    a.wikidata_id,
    a.title,
    a.url,
    CHAR_LENGTH(a.text) AS length,
    fi_cat.category AS category,
    c.x,
    c.y,
    c.z,
    (hs.page_id IS NOT NULL) AS has_history,
    YEAR(hs.first_edit) AS first_edit_year,
    CAST(
        NULLIF(
            REGEXP_SUBSTR(
                -- lead only: after the first newline, up to the first "## " heading (spec 023-B)
                IF(LOCATE('\n', a.text) > 0,
                   SUBSTRING_INDEX(SUBSTRING(a.text, LOCATE('\n', a.text) + 1), '\n## ', 1), ''),
                '\\b(1[0-9]{3}|20[0-2][0-9])\\b'
            ),
            ''
        ) AS UNSIGNED
    ) AS event_year,
    YEAR(ac.created_at) AS created_year,
    g.lat,
    g.lon
FROM wikirag.article a
JOIN wikirag.article_coord c
  ON c.lang = a.lang AND c.page_id = a.page_id
LEFT JOIN wikirag.article fi
  ON a.lang <> 'fi'
 AND a.wikidata_id IS NOT NULL
 AND fi.lang = 'fi'
 AND fi.wikidata_id = a.wikidata_id
LEFT JOIN (
    SELECT page_id, MIN(category) AS category
    FROM wikirag.article_category
    WHERE lang = 'fi'
    GROUP BY page_id
) fi_cat
  ON fi_cat.page_id = IF(a.lang = 'fi', a.page_id, fi.page_id)
LEFT JOIN wikihistory.history_stats hs
  ON a.lang = 'fi' AND hs.page_id = a.page_id
LEFT JOIN wikirag.article_created ac
  ON ac.lang = a.lang AND ac.page_id = a.page_id
LEFT JOIN wikirag.article_geo g
  ON g.wikidata_id = a.wikidata_id
ORDER BY a.lang, a.page_id
"""

ARTICLE_WITH_IMAGE_SQL = """
SELECT
    a.lang,
    a.page_id,
    a.rev_id,
    a.wikidata_id,
    a.title,
    a.url,
    a.date_modified,
    a.text,
    (hs.page_id IS NOT NULL) AS has_history,
    img.thumb_url AS thumb_url,
    img.file_name AS thumb_file,
    img.license AS image_license,
    img.license_url AS image_license_url,
    img.artist AS image_artist,
    img.credit AS image_credit,
    img.non_free AS image_non_free
FROM wikirag.article a
LEFT JOIN wikihistory.history_stats hs
  ON a.lang = 'fi' AND hs.page_id = a.page_id
LEFT JOIN wikirag.article_image img
  ON img.lang = a.lang AND img.page_id = a.page_id
WHERE a.lang = ? AND a.page_id = ?
"""

ARTICLE_NO_IMAGE_SQL = """
SELECT
    a.lang,
    a.page_id,
    a.rev_id,
    a.wikidata_id,
    a.title,
    a.url,
    a.date_modified,
    a.text,
    (hs.page_id IS NOT NULL) AS has_history,
    NULL AS thumb_url,
    NULL AS thumb_file,
    NULL AS image_license,
    NULL AS image_license_url,
    NULL AS image_artist,
    NULL AS image_credit,
    0 AS image_non_free
FROM wikirag.article a
LEFT JOIN wikihistory.history_stats hs
  ON a.lang = 'fi' AND hs.page_id = a.page_id
WHERE a.lang = ? AND a.page_id = ?
"""

REV_BY_ID_SQL = """
SELECT title, rev_id, user, comment, text, row_start, row_end
FROM article FOR SYSTEM_TIME ALL
WHERE page_id = ? AND rev_id = ?
LIMIT 1
"""

# shortcut: stars cached for process lifetime, restart api after data reloads
_stars_lock = threading.Lock()
_stars_json_bytes: bytes | None = None


def _init_session(con: mariadb.Connection) -> mariadb.Connection:
    """Apply required UTC timezone and HNSW search settings on every DB connection."""
    cur = con.cursor()
    try:
        cur.execute("SET time_zone = '+00:00'")
        cur.execute(f"SET mhnsw_ef_search = {rag_common.EF_SEARCH}")
    finally:
        cur.close()
    return con


def _open_rag() -> mariadb.Connection:
    return _init_session(rag_common.connect())


def _open_svt() -> mariadb.Connection:
    return _init_session(svt_common.connect())


def _iso_utc(val: Any) -> str:
    """Format a datetime or SQL timestamp string as ISO-8601 UTC YYYY-MM-DDTHH:MM:SSZ."""
    if isinstance(val, datetime):
        dt = val.astimezone(timezone.utc) if val.tzinfo is not None else val
        return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    text = str(val).strip().replace("T", " ").rstrip("Z")
    if "." in text:
        text = text.split(".", 1)[0]
    dt = datetime.strptime(text, "%Y-%m-%d %H:%M:%S")
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _normalize_at(at: str | None) -> str:
    """Normalize at ('YYYY', 'YYYY-MM-DD', 'YYYY-MM-DD HH:MM:SS', or None) to UTC SQL form."""
    if at is None:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    raw = at.strip()
    if _YEAR_RE.fullmatch(raw):
        year = int(raw)
        if year < 1 or year > 9999:
            raise HTTPException(status_code=422, detail="Year out of range")
        return f"{raw}-12-31 23:59:59"
    if _DATE_RE.fullmatch(raw):
        try:
            datetime.strptime(raw, "%Y-%m-%d")
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="Invalid calendar date") from exc
        return f"{raw} 00:00:00"
    if _DATETIME_RE.fullmatch(raw):
        try:
            datetime.strptime(raw, "%Y-%m-%d %H:%M:%S")
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="Invalid datetime") from exc
        return raw
    raise HTTPException(
        status_code=422,
        detail="Invalid 'at' timestamp; expected YYYY, YYYY-MM-DD, or YYYY-MM-DD HH:MM:SS",
    )


def _gap_fill_months(rows: list[tuple[str, int, int, int]]) -> list[dict[str, Any]]:
    """Expand sparse (month, edits, reverts, disputes) rows into contiguous YYYY-MM dicts."""
    if not rows:
        return []
    by_month = {
        month: {
            "month": month,
            "edits": int(edits),
            "reverts": int(reverts),
            "disputes": int(disputes),
        }
        for month, edits, reverts, disputes in rows
    }
    first_y, first_m = map(int, rows[0][0].split("-"))
    last_y, last_m = map(int, rows[-1][0].split("-"))
    cur_idx = first_y * 12 + (first_m - 1)
    end_idx = last_y * 12 + (last_m - 1)
    out: list[dict[str, Any]] = []
    while cur_idx <= end_idx:
        y, m0 = divmod(cur_idx, 12)
        key = f"{y:04d}-{m0 + 1:02d}"
        out.append(by_month.get(key, {"month": key, "edits": 0, "reverts": 0, "disputes": 0}))
        cur_idx += 1
    return out


def _build_stars_payload() -> bytes:
    """Query and serialize the 29,460-star galaxy payload once per process."""
    con = _open_rag()
    try:
        cur = con.cursor()
        try:
            cur.execute(STARS_SQL)
            stars = []
            for row in cur.fetchall():
                (
                    lang,
                    page_id,
                    wikidata_id,
                    title,
                    url,
                    length,
                    category,
                    x,
                    y,
                    z,
                    has_history,
                    first_edit_year,
                    event_year,
                    created_year,
                    lat,
                    lon,
                ) = row
                hist = bool(has_history)
                stars.append(
                    {
                        "lang": lang,
                        "page_id": int(page_id),
                        "wikidata_id": wikidata_id,
                        "title": title,
                        "url": url,
                        "length": int(length),
                        "category": category,
                        "x": float(x),
                        "y": float(y),
                        "z": float(z),
                        "has_history": hist,
                        "first_edit_year": int(first_edit_year)
                        if hist and first_edit_year is not None
                        else None,
                        "event_year": int(event_year) if event_year is not None else None,
                        "created_year": int(created_year) if created_year is not None else None,
                        "lat": float(lat) if lat is not None else None,
                        "lon": float(lon) if lon is not None else None,
                    }
                )
            return json.dumps(stars, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        finally:
            cur.close()
    finally:
        con.close()


def _get_stars_payload() -> bytes:
    global _stars_json_bytes
    if _stars_json_bytes is not None:
        return _stars_json_bytes
    with _stars_lock:
        if _stars_json_bytes is None:
            _stars_json_bytes = _build_stars_payload()
    return _stars_json_bytes


def _other_language_triples(
    raw_also: dict[str, list[tuple[str, str, str]]],
    wikidata_id: str | None,
    own_lang: str,
) -> list[list[str]]:
    if not wikidata_id:
        return []
    return [
        [sib_lang, sib_title, sib_url]
        for sib_lang, sib_title, sib_url in raw_also.get(wikidata_id, [])
        if sib_lang != own_lang
    ]


def _word_diff(old_text: str, new_text: str) -> list[dict[str, str]]:
    """Word diff keeping whitespace tokens and merging adjacent same-op tokens."""
    a = [tok for tok in re.split(r"(\s+)", old_text) if tok]
    b = [tok for tok in re.split(r"(\s+)", new_text) if tok]
    raw_ops: list[dict[str, str]] = []
    for op, a1, a2, b1, b2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if op == "equal":
            raw_ops.append({"t": "eq", "text": "".join(a[a1:a2])})
        if op in ("delete", "replace"):
            raw_ops.append({"t": "del", "text": "".join(a[a1:a2])})
        if op in ("insert", "replace"):
            raw_ops.append({"t": "ins", "text": "".join(b[b1:b2])})
    merged: list[dict[str, str]] = []
    for item in raw_ops:
        if merged and merged[-1]["t"] == item["t"]:
            merged[-1]["text"] += item["text"]
        else:
            merged.append(item)
    return merged


def _clean_blocks(text: str) -> list[tuple[str, str]]:
    """Convert wikitext to (tag, text) blocks with HTML entities unescaped."""
    return [(tag, html.unescape(txt)) for tag, txt in history.clean(text)]


def _diff_blocks(
    old_blocks: list[tuple[str, str]],
    new_blocks: list[tuple[str, str]],
) -> list[dict[str, Any]]:
    """Port block + word diff from organizers' app.py into structured JSON diff parts."""
    old = [history.to_html([b]) for b in old_blocks]
    new = [history.to_html([b]) for b in new_blocks]
    parts: list[dict[str, Any]] = []
    for op, a1, a2, b1, b2 in difflib.SequenceMatcher(None, old, new, autojunk=False).get_opcodes():
        if op == "equal":
            parts.append({"op": "same", "count": a2 - a1})
            continue
        pairs: list[tuple[int, int]] = []
        if op == "replace":
            for i, j in zip(range(a1, a2), range(b1, b2)):
                if difflib.SequenceMatcher(None, old_blocks[i][1], new_blocks[j][1]).ratio() > 0.5:
                    pairs.append((i, j))
        paired_a = {i for i, _ in pairs}
        paired_b = {j for _, j in pairs}
        for i in range(a1, a2):
            if i not in paired_a:
                parts.append({"op": "del", "block": [old_blocks[i][0], old_blocks[i][1]]})
        for i, j in pairs:
            parts.append({"op": "edit", "words": _word_diff(old_blocks[i][1], new_blocks[j][1])})
        for j in range(b1, b2):
            if j not in paired_b:
                parts.append({"op": "ins", "block": [new_blocks[j][0], new_blocks[j][1]]})
    return parts


def _resolve_diff_side(cur: mariadb.Cursor, page_id: int, param: str | None) -> dict[str, Any] | None:
    if param is not None and _REV_ID_RE.fullmatch(param.strip()):
        found = history.rows(cur, REV_BY_ID_SQL, (page_id, int(param.strip())))
        if found:
            return found[0]
        # Old revisions have short ids (e.g. 6110); digits that are no rev of this page are a year
        # only when they look like a Wikipedia year, otherwise 404.
        if not (_YEAR_RE.fullmatch(param.strip()) and 2001 <= int(param) <= 2100):
            return None
    moment = _normalize_at(param)
    return history.as_of(cur, page_id, moment)


def _prewarm_asof_diff() -> None:
    """Best-effort startup pre-warm of Talvisota (fi:1256) asof/diff cache entries."""
    t0 = time.perf_counter()
    warmed = 0
    failed = 0
    today_rev: str | None = None

    try:
        con = _open_rag()
        try:
            cur = con.cursor()
            try:
                cur.execute(
                    "SELECT rev_id FROM wikirag.article WHERE lang = ? AND page_id = ? LIMIT 1",
                    ("fi", 1256),
                )
                row = cur.fetchone()
                if row and row[0] is not None:
                    today_rev = str(int(row[0]))
            finally:
                cur.close()
        finally:
            con.close()
    except Exception:
        failed += 1
        logger.warning("Pre-warm failed querying today rev_id for fi:1256", exc_info=True)

    asof_revs: dict[str, str] = {}
    for at_val in ("2006-12-31", "2012-12-31", "2026-12-31"):
        try:
            payload = _get_asof_cached(1256, _normalize_at(at_val))
            asof_revs[at_val] = str(payload["rev_id"])
            warmed += 1
        except Exception:
            failed += 1
            logger.warning("Pre-warm failed for /api/asof/1256?at=%s", at_val, exc_info=True)

    if today_rev is not None:
        # Spec 033: the demo clicks are As of 2006 / 2012 (diff from that revision) and the 2006 card.
        from_revs = ["1862876", "2114325"]
        for at_val in ("2012-12-31", "2026-12-31"):
            rev = asof_revs.get(at_val)
            if rev and rev not in from_revs and rev != today_rev:
                from_revs.append(rev)
        for from_rev in from_revs:
            try:
                _get_diff_cached(1256, from_rev, today_rev)
                warmed += 1
            except Exception:
                failed += 1
                logger.warning(
                    "Pre-warm failed for /api/diff/1256?from=%s&to=%s",
                    from_rev,
                    today_rev,
                    exc_info=True,
                )

    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    logger.info(
        "Pre-warmed asof/diff cache for fi:1256 (today=%s, warmed=%d, failed=%d, %.0f ms)",
        today_rev,
        warmed,
        failed,
        elapsed_ms,
    )


# Spec 033 profiling aid: WM_TIMING=1 logs one line per /api/asof and /api/diff request
# (cache hit/miss, queue wait, handler, SQL, clean, diff, TTFB, total) and gen-2 GC pauses.
_TIMING = os.environ.get("WM_TIMING") == "1"
_rec: contextvars.ContextVar[dict | None] = contextvars.ContextVar("wm_rec", default=None)


def _tmark(key: str, t0: float) -> None:
    d = _rec.get()
    if _TIMING and d is not None:
        d[key] = d.get(key, 0.0) + (time.perf_counter() - t0) * 1000.0


def _tset(key: str, val: Any) -> None:
    d = _rec.get()
    if _TIMING and d is not None:
        d[key] = val


if _TIMING:
    _gc_t: dict[int, float] = {}

    def _gc_cb(phase: str, info: dict) -> None:
        if phase == "start":
            _gc_t[info["generation"]] = time.perf_counter()
        elif info["generation"] == 2:
            logger.warning("WMT gc gen2 %.1f ms collected=%s", (time.perf_counter() - _gc_t.get(2, 0)) * 1000.0, info.get("collected"))

    gc.callbacks.append(_gc_cb)


class _TimingMiddleware:
    """Pure-ASGI so it also sees the gzip'd send; outermost middleware."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        path = scope.get("path", "")
        if scope["type"] != "http" or not (path.startswith("/api/asof") or path.startswith("/api/diff")):
            await self.app(scope, receive, send)
            return
        t0 = time.perf_counter()
        rec: dict[str, Any] = {"_t0": t0}
        _rec.set(rec)

        async def _send(msg):
            if msg["type"] == "http.response.start":
                rec["ttfb"] = (time.perf_counter() - t0) * 1000.0
            await send(msg)

        await self.app(scope, receive, _send)
        total = (time.perf_counter() - t0) * 1000.0
        logger.warning(
            "WMT %s?%s %s",
            path,
            scope.get("query_string", b"").decode(),
            " ".join(f"{k}={v:.1f}" if isinstance(v, float) else f"{k}={v}" for k, v in {**rec, "total": total}.items() if k != "_t0"),
        )


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _get_stars_payload()
    if not os.environ.get("PYTEST_CURRENT_TEST"):
        threading.Thread(target=_prewarm_asof_diff, name="prewarm-asof-diff", daemon=True).start()
    yield


app = FastAPI(title="wikimemory API", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=1000)
if _TIMING:
    app.add_middleware(_TimingMiddleware)


@app.get("/api/stars")
def get_stars():
    return Response(content=_get_stars_payload(), media_type="application/json")


@app.get("/api/search")
def search_articles(q: str = "", lang: str = "", limit: int = 10):
    if lang not in ("", *VALID_LANGS):
        raise HTTPException(status_code=422, detail="lang must be empty or one of fi, sv, en")
    q_clean = q.strip()
    if not q_clean:
        return {"rows": [], "also": {}}
    clamped_limit = max(1, min(50, limit))

    con = _open_rag()
    try:
        cur = con.cursor()
        try:
            _, raw_rows = rag_common.search(
                cur,
                q_clean,
                mode="vector",
                lang=lang or None,
                limit=clamped_limit,
            )
            raw_also = rag_common.other_languages(cur, raw_rows)
        finally:
            cur.close()
    finally:
        con.close()

    rows = [
        {
            "lang": r["lang"],
            "page_id": int(r["page_id"]),
            "wikidata_id": r["wikidata_id"],
            "title": r["title"],
            "url": r["url"],
            "distance": float(r["distance"]),
        }
        for r in raw_rows
    ]

    also: dict[str, list[list[str]]] = {}
    for r in rows:
        qid = r["wikidata_id"]
        if not qid or qid in also:
            continue
        siblings = _other_language_triples(raw_also, qid, r["lang"])
        if siblings:
            also[qid] = siblings

    return {"rows": rows, "also": also}


@app.get("/api/article/{lang}/{page_id}")
def get_article(lang: str, page_id: int):
    if lang not in VALID_LANGS:
        raise HTTPException(status_code=422, detail="lang must be one of fi, sv, en")

    con = _open_rag()
    try:
        cur = con.cursor()
        try:
            try:
                cur.execute(ARTICLE_WITH_IMAGE_SQL, (lang, page_id))
            except mariadb.ProgrammingError:
                cur.execute(ARTICLE_NO_IMAGE_SQL, (lang, page_id))
            fetched = cur.fetchone()
            if fetched is None:
                raise HTTPException(status_code=404, detail=f"Article {lang}:{page_id} not found")

            cols = [d[0] for d in cur.description]
            row = dict(zip(cols, fetched))

            if lang == "fi":
                cur.execute(
                    "SELECT category FROM wikirag.article_category "
                    "WHERE lang = 'fi' AND page_id = ? ORDER BY category",
                    (page_id,),
                )
                categories = [r[0] for r in cur.fetchall()]
            elif row["wikidata_id"]:
                cur.execute(
                    "SELECT c.category FROM wikirag.article fi "
                    "JOIN wikirag.article_category c ON c.lang = 'fi' AND c.page_id = fi.page_id "
                    "WHERE fi.lang = 'fi' AND fi.wikidata_id = ? ORDER BY c.category",
                    (row["wikidata_id"],),
                )
                categories = [r[0] for r in cur.fetchall()]
            else:
                categories = []

            raw_also = rag_common.other_languages(cur, [row])
            other_langs = _other_language_triples(raw_also, row["wikidata_id"], lang)
        finally:
            cur.close()
    finally:
        con.close()

    text = row["text"]
    words = len(text.split())
    is_non_free = bool(row["image_non_free"])
    if is_non_free or not row["thumb_url"] or not row["thumb_file"]:
        thumb_url = None
        thumb_file = None
        image = None
    else:
        thumb_url = row["thumb_url"]
        thumb_file = row["thumb_file"]
        image = {
            "thumb_url": thumb_url,
            "file_page_url": "https://commons.wikimedia.org/wiki/File:"
            + urllib.parse.quote(thumb_file),
            "license": row["image_license"] or None,
            "license_url": row["image_license_url"] or None,
            "artist": row["image_artist"] or None,
            "credit": row["image_credit"] or None,
        }
    return {
        "lang": row["lang"],
        "page_id": int(row["page_id"]),
        "rev_id": int(row["rev_id"]),
        "wikidata_id": row["wikidata_id"],
        "title": row["title"],
        "url": row["url"],
        "date_modified": _iso_utc(row["date_modified"]),
        "length": len(text),
        "words": words,
        "reading_minutes": max(1, math.ceil(words / 240)),
        "station_count": sum(1 for line in text.splitlines() if line.startswith("## ")),
        "text": text,
        "categories": categories,
        "other_languages": other_langs,
        "has_history": bool(row["has_history"]),
        "thumb_url": thumb_url,
        "thumb_file": thumb_file,
        "image": image,
    }


@app.get("/api/timeline")
def get_global_timeline():
    con = _open_svt()
    try:
        cur = con.cursor()
        try:
            cur.execute("SELECT month, edits, reverts, disputes FROM global_month_stats ORDER BY month")
            rows = cur.fetchall()
        finally:
            cur.close()
    finally:
        con.close()
    return {"months": _gap_fill_months(rows)}


@app.get("/api/timeline/{page_id}")
def get_article_timeline(page_id: int):
    con = _open_svt()
    try:
        cur = con.cursor()
        try:
            cur.execute(
                "SELECT first_edit, versions, reverts, disputes, war_months "
                "FROM history_stats WHERE page_id = ?",
                (page_id,),
            )
            stats = cur.fetchone()
            if stats is None:
                raise HTTPException(status_code=404, detail=f"No edit history for page_id {page_id}")
            cur.execute(
                "SELECT month, edits, reverts, disputes "
                "FROM month_stats WHERE page_id = ? ORDER BY month",
                (page_id,),
            )
            month_rows = cur.fetchall()
        finally:
            cur.close()
    finally:
        con.close()

    first_edit, versions, reverts, disputes, war_months = stats
    return {
        "summary": {
            "versions": int(versions),
            "reverts": int(reverts),
            "disputes": int(disputes),
            "war_months": int(war_months),
            "first_edit": _iso_utc(first_edit),
        },
        "months": _gap_fill_months(month_rows),
    }


def _build_asof_payload(page_id: int, moment: str) -> dict[str, Any]:
    _t = time.perf_counter()
    con = _open_svt()
    _tmark("conn", _t)
    try:
        cur = con.cursor()
        try:
            _t = time.perf_counter()
            row = history.as_of(cur, page_id, moment)
            _tmark("sql", _t)
        finally:
            cur.close()
    finally:
        con.close()

    if row is None:
        raise HTTPException(status_code=404, detail=f"No snapshot for page_id {page_id} at {moment}")

    row_end = row["row_end"]
    row_end_iso = None if row_end is None else _iso_utc(row_end)
    is_current = row_end_iso is None or row_end_iso.startswith("2106-")
    _t = time.perf_counter()
    blocks = [[tag, txt] for tag, txt in _clean_blocks(row["text"])]
    _tmark("clean", _t)
    return {
        "title": row["title"],
        "rev_id": int(row["rev_id"]),
        "user": row["user"] or "",
        "comment": row["comment"] or "",
        "row_start": _iso_utc(row["row_start"]),
        "row_end": None if is_current else row_end_iso,
        "blocks": blocks,
    }


# shortcut: process-lifetime cache, restart api after data reloads
@lru_cache(maxsize=256)
def _get_asof_cached(page_id: int, moment: str) -> dict[str, Any]:
    return _build_asof_payload(page_id, moment)


@app.get("/api/asof/{page_id}")
def get_asof(page_id: int, at: str | None = None):
    d = _rec.get()
    if _TIMING and d is not None:
        d["wait"] = (time.perf_counter() - d["_t0"]) * 1000.0
    moment = _normalize_at(at)
    if at is None:
        return _build_asof_payload(page_id, moment)
    _t = time.perf_counter()
    h0 = _get_asof_cached.cache_info().hits if _TIMING else 0
    out = _get_asof_cached(page_id, moment)
    if _TIMING:
        _tset("hit", int(_get_asof_cached.cache_info().hits > h0))
    _tmark("handler", _t)
    return out


def _build_diff_payload(page_id: int, from_param: str, to_param: str | None) -> dict[str, Any]:
    _t = time.perf_counter()
    con = _open_svt()
    _tmark("conn", _t)
    try:
        cur = con.cursor()
        try:
            _t = time.perf_counter()
            from_row = _resolve_diff_side(cur, page_id, from_param)
            to_row = _resolve_diff_side(cur, page_id, to_param)
            _tmark("sql", _t)
        finally:
            cur.close()
    finally:
        con.close()

    if from_row is None or to_row is None:
        raise HTTPException(status_code=404, detail=f"Could not resolve diff revision for page_id {page_id}")

    _t = time.perf_counter()
    old_blocks = _clean_blocks(from_row["text"])
    new_blocks = _clean_blocks(to_row["text"])
    _tmark("clean", _t)
    _t = time.perf_counter()
    out = {"parts": _diff_blocks(old_blocks, new_blocks)}
    _tmark("diff", _t)
    return out


# shortcut: process-lifetime cache, restart api after data reloads
@lru_cache(maxsize=256)
def _get_diff_cached(page_id: int, from_param: str, to_param: str) -> dict[str, Any]:
    return _build_diff_payload(page_id, from_param, to_param)


@app.get("/api/diff/{page_id}")
def get_diff(
    page_id: int,
    from_param: str = Query(..., alias="from"),
    to_param: str | None = Query(default=None, alias="to"),
):
    d = _rec.get()
    if _TIMING and d is not None:
        d["wait"] = (time.perf_counter() - d["_t0"]) * 1000.0
    from_key = from_param.strip()
    if to_param is None:
        return _build_diff_payload(page_id, from_key, None)
    _t = time.perf_counter()
    h0 = _get_diff_cached.cache_info().hits if _TIMING else 0
    out = _get_diff_cached(page_id, from_key, to_param.strip())
    if _TIMING:
        _tset("hit", int(_get_diff_cached.cache_info().hits > h0))
    _tmark("handler", _t)
    return out


@app.get("/api/summary/{lang}/{page_id}")
def get_summary(lang: str, page_id: int, background_tasks: BackgroundTasks, ui: str | None = None):
    return summary.get_summary_response(lang, page_id, background_tasks, ui=ui)


@app.get("/api/compare/{lang}/{page_id}")
def get_compare(lang: str, page_id: int):
    return compare.get_compare_response(lang, page_id)


@app.get("/api/threads/{lang}/{page_id}")
def get_threads(lang: str, page_id: int, exclude: str = ""):
    return threads.get_threads_response(lang, page_id, exclude)


@app.get("/api/topic-road")
def get_topic_road(lang: str | None = None, page_id: int | None = None, category: str | None = None):
    return road.get_topic_road_response(lang=lang, page_id=page_id, category=category)


@app.get("/api/ask")
def get_ask(background_tasks: BackgroundTasks, q: str | None = None, ui: str | None = None):
    return ask.get_ask_response(q, background_tasks, ui=ui)


if DIST_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(DIST_DIR), html=True), name="static")
