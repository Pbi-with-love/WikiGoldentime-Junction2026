"""Cross-language section comparison against Swedish and English Wikipedia siblings."""

from __future__ import annotations

import logging
import re
from typing import Any, Callable
import urllib.parse
import html

from fastapi import HTTPException
import mariadb

from backend import rag_common, summary

logger = logging.getLogger(__name__)

VALID_LANGS = ("fi", "sv", "en")
SIBLING_LANGS = ("sv", "en")
PASSAGE_MAX_CHARS = 240
SHORT_ARTICLE_MIN_WORDS = 1500
SHORT_ARTICLE_MIN_SECTIONS = 4

# Calibrated on 23 Finnish articles (3 demo + 20 deterministic sample); see artifacts/017-compare/calibration.md
THRESHOLD = 0.35

PAIR_DISTANCES_SQL = """
SELECT f.chunk_no, s.chunk_no, VEC_DISTANCE_COSINE(f.embedding, s.embedding) AS d
FROM chunk_vector f
JOIN chunk_vector s ON s.lang = ? AND s.page_id = ?
WHERE f.lang = 'fi' AND f.page_id = ?
"""

FI_CHUNK_SECTIONS_SQL = """
SELECT chunk_no, section
FROM chunk
WHERE lang = 'fi' AND page_id = ?
"""

SIBLING_CHUNKS_BY_NO_SQL = """
SELECT chunk_no, section, text
FROM chunk
WHERE lang = ? AND page_id = ? AND chunk_no IN ({placeholders})
"""


def _open_rag() -> mariadb.Connection:
    con = rag_common.connect()
    cur = con.cursor()
    try:
        cur.execute("SET time_zone = '+00:00'")
    finally:
        cur.close()
    return con


def format_passage(chunk_text: str, max_chars: int = PASSAGE_MAX_CHARS) -> str:
    """Drop chunk prefix, strip Markdown links/emphasis, unescape HTML, cut on word boundary."""
    text = str(chunk_text or "")
    if "\n\n" in text:
        body = text.split("\n\n", 1)[1]
    elif text.startswith("# ") and "\n" in text:
        body = text.split("\n", 1)[1]
    else:
        body = text
    cleaned = summary.strip_markdown(body)
    cleaned = re.sub(r"(?m)^\s*#{1,6}\s+", "", cleaned)
    unescaped = html.unescape(cleaned)
    normalized = summary.normalize_ws(unescaped)
    return summary._truncate_word_boundary(normalized, max_chars)


def build_section_url(article_url: str, section: str | None) -> str:
    """Build Wikipedia URL, appending percent-encoded section anchor when section is non-null."""
    if not section:
        return article_url
    anchor = urllib.parse.quote(section.replace(" ", "_"))
    return f"{article_url}#{anchor}"


def compute_section_winners(
    kept_sections: list[dict[str, Any]],
    fi_chunk_sections: dict[int, str | None],
    distance_pairs: dict[str, list[tuple[int, int, float]]],
    siblings: dict[str, dict[str, Any] | None],
    *,
    article_page_id: int | None = None,
) -> tuple[dict[tuple[int, str], tuple[float, int] | None], set[int]]:
    """Compute min distance and winning sibling chunk_no for each (section no, sib_lang).

    Returns ``(winners, sections_without_chunks)`` where ``winners[(no, sib_lang)]`` is
    ``(rounded_distance, sib_chunk_no)`` or ``None``.
    """
    # shortcut: duplicate headings in the same article share their chunks
    chunks_by_heading: dict[str, list[int]] = {}
    for chunk_no, sec_name in fi_chunk_sections.items():
        if sec_name is not None:
            chunks_by_heading.setdefault(sec_name, []).append(int(chunk_no))

    best_by_fi_chunk: dict[str, dict[int, tuple[float, int]]] = {}
    for sib_lang in SIBLING_LANGS:
        if siblings.get(sib_lang) is None:
            continue
        per_fi: dict[int, tuple[float, int]] = {}
        for fi_cno, sib_cno, dist in distance_pairs.get(sib_lang, ()):
            f_idx = int(fi_cno)
            s_idx = int(sib_cno)
            d_val = float(dist)
            prev = per_fi.get(f_idx)
            if prev is None or d_val < prev[0] or (d_val == prev[0] and s_idx < prev[1]):
                per_fi[f_idx] = (d_val, s_idx)
        best_by_fi_chunk[sib_lang] = per_fi

    winners: dict[tuple[int, str], tuple[float, int] | None] = {}
    missing_chunk_nos: set[int] = set()

    for sec in kept_sections:
        sec_no = int(sec["no"])
        heading = str(sec["heading"])
        fi_chunks = chunks_by_heading.get(heading, [])
        if not fi_chunks:
            missing_chunk_nos.add(sec_no)
            logger.warning(
                "Compare: fi:%s section %d (%r) has no chunks in chunk table",
                article_page_id if article_page_id is not None else "?",
                sec_no,
                heading,
            )
            for sib_lang in SIBLING_LANGS:
                winners[(sec_no, sib_lang)] = None
            continue

        for sib_lang in SIBLING_LANGS:
            if siblings.get(sib_lang) is None:
                winners[(sec_no, sib_lang)] = None
                continue
            per_fi = best_by_fi_chunk.get(sib_lang, {})
            best_pair: tuple[float, int] | None = None
            for f_idx in fi_chunks:
                cand = per_fi.get(f_idx)
                if cand is None:
                    continue
                if (
                    best_pair is None
                    or cand[0] < best_pair[0]
                    or (cand[0] == best_pair[0] and cand[1] < best_pair[1])
                ):
                    best_pair = cand
            if best_pair is None:
                winners[(sec_no, sib_lang)] = None
            else:
                winners[(sec_no, sib_lang)] = (round(best_pair[0], 3), best_pair[1])

    return winners, missing_chunk_nos


def format_compare_sections(
    kept_sections: list[dict[str, Any]],
    winners: dict[tuple[int, str], tuple[float, int] | None],
    siblings: dict[str, dict[str, Any] | None],
    sibling_chunks: dict[str, dict[int, tuple[str | None, str]]],
    *,
    threshold: float = THRESHOLD,
) -> list[dict[str, Any]]:
    """Build the contract ``sections`` list from precomputed winners and sibling chunk rows."""
    out: list[dict[str, Any]] = []
    for sec in kept_sections:
        sec_no = int(sec["no"])
        item: dict[str, Any] = {
            "no": sec_no,
            "heading": str(sec["heading"]),
            "sv": None,
            "en": None,
        }
        for sib_lang in SIBLING_LANGS:
            sib_meta = siblings.get(sib_lang)
            winner = winners.get((sec_no, sib_lang))
            if sib_meta is None or winner is None:
                item[sib_lang] = None
                continue
            dist, win_cno = winner
            is_match = dist <= threshold
            if not is_match:
                item[sib_lang] = {
                    "match": False,
                    "distance": dist,
                    "section": None,
                    "passage": None,
                    "url": None,
                }
                continue
            chunk_row = sibling_chunks.get(sib_lang, {}).get(win_cno)
            if chunk_row is None:
                item[sib_lang] = {
                    "match": False,
                    "distance": dist,
                    "section": None,
                    "passage": None,
                    "url": None,
                }
                continue
            sib_sec, sib_text = chunk_row
            item[sib_lang] = {
                "match": True,
                "distance": dist,
                "section": sib_sec,
                "passage": format_passage(sib_text),
                "url": build_section_url(str(sib_meta["url"]), sib_sec),
            }
        out.append(item)
    return out


def aggregate_compare_sections(
    kept_sections: list[dict[str, Any]],
    fi_chunk_sections: dict[int, str | None],
    siblings: dict[str, dict[str, Any] | None],
    distance_pairs: dict[str, list[tuple[int, int, float]]],
    sibling_chunks: dict[str, dict[int, tuple[str | None, str]]],
    *,
    threshold: float = THRESHOLD,
    article_page_id: int | None = None,
) -> list[dict[str, Any]]:
    """Pure end-to-end section comparison from distance pairs and chunk maps (no DB access)."""
    winners, _ = compute_section_winners(
        kept_sections=kept_sections,
        fi_chunk_sections=fi_chunk_sections,
        distance_pairs=distance_pairs,
        siblings=siblings,
        article_page_id=article_page_id,
    )
    return format_compare_sections(
        kept_sections=kept_sections,
        winners=winners,
        siblings=siblings,
        sibling_chunks=sibling_chunks,
        threshold=threshold,
    )


def _fetch_article(cur: mariadb.Cursor, lang: str, page_id: int) -> dict[str, Any] | None:
    cur.execute(summary.ARTICLE_SQL, (lang, page_id))
    fetched = cur.fetchone()
    if fetched is None:
        return None
    cols = [d[0] for d in cur.description]
    return dict(zip(cols, fetched))


def _fetch_siblings(
    cur: mariadb.Cursor,
    wikidata_id: str | None,
) -> dict[str, dict[str, Any] | None]:
    siblings: dict[str, dict[str, Any] | None] = {"sv": None, "en": None}
    if not wikidata_id:
        return siblings
    for sib_lang in SIBLING_LANGS:
        meta = summary._fetch_sibling_meta(cur, sib_lang, wikidata_id)
        if meta is not None:
            siblings[sib_lang] = {
                "page_id": int(meta["page_id"]),
                "title": str(meta["title"]),
                "url": str(meta["url"]),
            }
    return siblings


def get_compare_response(
    lang: str,
    page_id: int,
    rag_opener: Callable[[], mariadb.Connection] | None = None,
    *,
    threshold: float = THRESHOLD,
) -> dict[str, Any]:
    """Handle GET /api/compare/{lang}/{page_id}."""
    if lang not in VALID_LANGS:
        raise HTTPException(status_code=422, detail=f"Invalid language: {lang!r}. Expected fi, sv, or en.")
    if lang != "fi":
        raise HTTPException(status_code=404, detail="Compare is available for Finnish articles only")

    open_rag = rag_opener or _open_rag
    con = open_rag()
    try:
        cur = con.cursor()
        try:
            article_row = _fetch_article(cur, lang, page_id)
            if article_row is None:
                raise HTTPException(status_code=404, detail=f"Article {lang}:{page_id} not found")

            siblings = _fetch_siblings(cur, article_row.get("wikidata_id"))
            text = str(article_row["text"])
            article_words = summary.count_words(text)
            _, kept_sections, _ = summary.split_markdown_sections(text)
            is_short = (article_words < SHORT_ARTICLE_MIN_WORDS) or (
                len(kept_sections) < SHORT_ARTICLE_MIN_SECTIONS
            )

            article_meta = {
                "lang": "fi",
                "page_id": int(article_row["page_id"]),
                "title": str(article_row["title"]),
            }

            if is_short:
                return {
                    "article": article_meta,
                    "threshold": threshold,
                    "siblings": siblings,
                    "sections": [],
                }

            if siblings["sv"] is None and siblings["en"] is None:
                return {
                    "article": article_meta,
                    "threshold": threshold,
                    "siblings": siblings,
                    "sections": [
                        {
                            "no": int(sec["no"]),
                            "heading": str(sec["heading"]),
                            "sv": None,
                            "en": None,
                        }
                        for sec in kept_sections
                    ],
                }

            distance_pairs: dict[str, list[tuple[int, int, float]]] = {}
            for sib_lang in SIBLING_LANGS:
                sib_meta = siblings[sib_lang]
                if sib_meta is None:
                    continue
                cur.execute(PAIR_DISTANCES_SQL, (sib_lang, sib_meta["page_id"], page_id))
                distance_pairs[sib_lang] = [
                    (int(r[0]), int(r[1]), float(r[2])) for r in cur.fetchall()
                ]

            cur.execute(FI_CHUNK_SECTIONS_SQL, (page_id,))
            fi_chunk_sections: dict[int, str | None] = {
                int(r[0]): r[1] for r in cur.fetchall()
            }

            winners, _ = compute_section_winners(
                kept_sections=kept_sections,
                fi_chunk_sections=fi_chunk_sections,
                distance_pairs=distance_pairs,
                siblings=siblings,
                article_page_id=page_id,
            )

            sibling_chunks: dict[str, dict[int, tuple[str | None, str]]] = {}
            for sib_lang in SIBLING_LANGS:
                sib_meta = siblings[sib_lang]
                if sib_meta is None:
                    continue
                win_cnos = sorted(
                    {
                        winner[1]
                        for (sec_no, l_key), winner in winners.items()
                        if l_key == sib_lang and winner is not None and winner[0] <= threshold
                    }
                )
                if not win_cnos:
                    sibling_chunks[sib_lang] = {}
                    continue
                placeholders = ", ".join("?" for _ in win_cnos)
                sql = SIBLING_CHUNKS_BY_NO_SQL.format(placeholders=placeholders)
                cur.execute(sql, [sib_lang, sib_meta["page_id"], *win_cnos])
                sibling_chunks[sib_lang] = {
                    int(r[0]): (r[1], str(r[2])) for r in cur.fetchall()
                }
        finally:
            cur.close()
    finally:
        con.close()

    sections_out = format_compare_sections(
        kept_sections=kept_sections,
        winners=winners,
        siblings=siblings,
        sibling_chunks=sibling_chunks,
        threshold=threshold,
    )
    return {
        "article": article_meta,
        "threshold": threshold,
        "siblings": siblings,
        "sections": sections_out,
    }
