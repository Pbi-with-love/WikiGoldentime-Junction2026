"""Summary generation, grounding verification, SVT section history, and cache management."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import logging
import os
import re
import threading
from typing import Any, Callable

from fastapi import BackgroundTasks, HTTPException, Response
import mariadb

# Ensure SVT defaults to the merged 3307 server unless explicitly overridden.
os.environ.setdefault("DB_PORT", "3307")

from backend import history, rag_common, svt_common  # noqa: E402

if svt_common.DB["port"] == 3308 and os.environ.get("DB_PORT") != "3308":
    svt_common.DB["port"] = int(os.environ.get("SVT_DB_PORT", 3307))
elif "SVT_DB_PORT" in os.environ:
    svt_common.DB["port"] = int(os.environ["SVT_DB_PORT"])

logger = logging.getLogger(__name__)

VALID_LANGS = ("fi", "sv", "en")
SUMMARY_MODEL_DEFAULT = "claude-haiku-5-5"
MAX_GHOSTS = 5
GHOST_TEXT_MAX_CHARS = 600

DROP_HEADINGS = frozenset(
    {
        # Finnish
        "lähteet",
        "viitteet",
        "lähdeviitteet",
        "huomautukset",
        "kirjallisuutta",
        "aiheesta muualla",
        "katso myös",
        # Swedish
        "referenser",
        "källor",
        "noter",
        "se även",
        "externa länkar",
        "litteratur",
        # English
        "references",
        "notes",
        "sources",
        "see also",
        "external links",
        "further reading",
        "bibliography",
    }
)

ABBREVS = frozenset(
    {
        "esim",
        "mm",
        "ns",
        "nyk",
        "vrt",
        "ks",
        "n",
        "s",
        "k",
        "v",
        "t",
        "j",
        "ym",
        "yms",
        "jne",
        "tms",
        "em",
        "ko",
        "nk",
        "alk",
        "myöh",
        "tark",
        "mahd",
        "engl",
        "ruots",
        "saks",
        "ven",
        "lat",
        "ransk",
        "ca",
        "bl.a",
        "t.ex",
        "osv",
        "o.s.v",
        "s.k",
        "m.fl",
        "dvs",
        "d.v.s",
        "e.g",
        "i.e",
        "etc",
        "vs",
        "dr",
        "mr",
        "mrs",
        "ms",
        "st",
        "no",
        "prof",
    }
)

_HATNOTE_RE = re.compile(
    r"^(?:Pääartikkeli|Pääartikkelit|Main article|Main articles|Huvudartikel|Huvudartiklar)\s*:",
    re.IGNORECASE,
)
_WIKITEXT_H2_RE = re.compile(
    r"^==[^\S\r\n]*([^=\r\n].*?)[^\S\r\n]*==[^\S\r\n]*$",
    re.MULTILINE,
)
_SENTENCE_BOUNDARY_RE = re.compile(
    r"([.!?]+['\"”’»)\]]*(?:\[\d+\])*)(\s+)(?=[A-ZÅÄÖŠŽ\"“'«(0-9])"
)

FACT_ITEM_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["label", "value", "source"],
    "properties": {
        "label": {"type": "string"},
        "value": {"type": "string"},
        "source": {"type": "string"},
    },
}

ARTICLE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["tldr", "facts"],
    "properties": {
        "tldr": {"type": "string"},
        "facts": {"type": "array", "items": FACT_ITEM_SCHEMA},
    },
}

SECTION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["one_line", "summary", "facts"],
    "properties": {
        "one_line": {"type": "string"},
        "summary": {"type": "string"},
        "facts": {"type": "array", "items": FACT_ITEM_SCHEMA},
    },
}

SYSTEM_PROMPT = (
    "You summarize Wikipedia articles using ONLY the text provided in the user message. "
    "Do not use any outside knowledge or assumptions. "
    "Write all summaries and fact labels/values in the same language as the provided article text "
    "(Finnish for Finnish text, Swedish for Swedish text, English for English text). "
    "Output valid JSON only, matching the required schema:\n"
    "- For an article overview (`tldr`, `facts`): `tldr` must be 3 concise sentences.\n"
    "- For a section (`one_line`, `summary`, `facts`): `one_line` must be 1 concise sentence; "
    "`summary` must be 2-3 sentences.\n"
    "- For `facts`: include up to 3 key facts explicitly stated in the provided text. "
    "Every fact's `source` MUST be a single full sentence copied character-for-character verbatim "
    "from the provided text (never paraphrase, translate, shorten, or write placeholders). "
    "If no verbatim sentence supports a fact, return `[]` for `facts`."
)

SUMMARY_CACHE_DDL = """
CREATE TABLE IF NOT EXISTS wikirag.summary_cache (
    lang VARCHAR(3) NOT NULL,
    page_id INT UNSIGNED NOT NULL,
    rev_id BIGINT UNSIGNED NOT NULL,
    json LONGTEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (lang, page_id, rev_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
"""

ARTICLE_SQL = """
SELECT lang, page_id, rev_id, wikidata_id, title, url, text
FROM wikirag.article
WHERE lang = ? AND page_id = ?
"""

CACHE_GET_SQL = """
SELECT json
FROM wikirag.summary_cache
WHERE lang = ? AND page_id = ? AND rev_id = ?
"""

CACHE_PUT_SQL = """
INSERT INTO wikirag.summary_cache (lang, page_id, rev_id, json)
VALUES (?, ?, ?, ?)
ON DUPLICATE KEY UPDATE json = VALUES(json), created_at = CURRENT_TIMESTAMP
"""

SVT_CURRENT_ROW_SQL = """
SELECT title, rev_id, user, comment, text, row_start, row_end
FROM article
WHERE page_id = ?
"""

SVT_FIRST_STATS_SQL = "SELECT first_edit FROM history_stats WHERE page_id = ?"
SVT_FIRST_ROW_START_SQL = (
    "SELECT row_start FROM article FOR SYSTEM_TIME ALL "
    "WHERE page_id = ? ORDER BY row_start ASC LIMIT 1"
)
SVT_WAR_YEARS_SQL = (
    "SELECT DISTINCT LEFT(month, 4) FROM month_stats "
    "WHERE page_id = ? AND disputes >= 3"
)

_table_lock = threading.Lock()
_cache_table_ready = False

_inflight_lock = threading.Lock()
_inflight_jobs: set[tuple[str, int, int]] = set()


@dataclass
class BuildStats:
    """Counters collected while building a summary response."""

    sections: int = 0
    ghosts: int = 0
    facts_kept: int = 0
    facts_dropped: int = 0
    failed_calls: int = 0
    total_calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0


def _open_rag() -> mariadb.Connection:
    con = rag_common.connect()
    cur = con.cursor()
    try:
        cur.execute("SET time_zone = '+00:00'")
    finally:
        cur.close()
    return con


def _open_svt() -> mariadb.Connection:
    con = svt_common.connect()
    cur = con.cursor()
    try:
        cur.execute("SET time_zone = '+00:00'")
    finally:
        cur.close()
    return con


def ensure_cache_table(con: mariadb.Connection | None = None) -> None:
    """Create wikirag.summary_cache once per process if it does not already exist."""
    global _cache_table_ready
    if _cache_table_ready:
        return
    with _table_lock:
        if _cache_table_ready:
            return
        own_con = con is None
        conn = _open_rag() if own_con else con
        try:
            cur = conn.cursor()
            try:
                cur.execute(SUMMARY_CACHE_DDL)
                conn.commit()
            finally:
                cur.close()
            _cache_table_ready = True
        finally:
            if own_con:
                conn.close()


def count_words(text: str) -> int:
    return len(text.split())


def reading_minutes(words: int) -> int:
    return max(1, round(words / 240))


def normalize_ws(text: str) -> str:
    return " ".join(text.split())


def strip_markdown(text: str) -> str:
    """Strip Markdown link/image and emphasis syntax while preserving prose."""
    out = re.sub(r"!\[([^\]]*)\]\([^)]+\)", r"\1", text)
    out = re.sub(r"\[([^\[\]]+)\]\([^)]+\)", r"\1", out)
    out = re.sub(r"\*\*\*([^*]+)\*\*\*", r"\1", out)
    out = re.sub(r"\*\*([^*]+)\*\*", r"\1", out)
    out = re.sub(r"__([^_]+)__", r"\1", out)
    out = re.sub(r"(?<!\w)\*(?!\s)([^*]+?)(?<!\s)\*(?!\w)", r"\1", out)
    out = re.sub(r"(?<!\w)_(?!\s)([^_]+?)(?<!\s)_(?!\w)", r"\1", out)
    return out


def _split_paragraph_sentences(para: str) -> list[str]:
    sentences: list[str] = []
    start = 0
    for match in _SENTENCE_BOUNDARY_RE.finditer(para):
        end_punct = match.start() + len(match.group(1))
        punct = para[match.start()]
        before = para[start : match.start()]
        last_word = re.split(r"\s+", before)[-1] if before else ""
        if punct == "." and re.fullmatch(r"[A-ZÅÄÖŠŽ]", last_word):
            continue
        if punct == "." and last_word.lower().lstrip("\"'(") in ABBREVS:
            continue
        if punct == "." and re.fullmatch(r"\d{1,2}", last_word):
            continue
        sent = para[start:end_punct].strip()
        if sent:
            sentences.append(sent)
        start = match.end()
    tail = para[start:].strip()
    if tail:
        sentences.append(tail)
    return sentences


def extract_prose_sentences(markdown_text: str) -> list[str]:
    """Return stripped prose sentences from Markdown, skipping heading and hatnote lines."""
    prose_lines: list[str] = []
    fallback_lines: list[str] = []
    for raw_line in markdown_text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        cleaned = strip_markdown(line).strip()
        if cleaned.startswith("- ") or cleaned.startswith("* "):
            cleaned = cleaned[2:].strip()
        if not cleaned:
            continue
        fallback_lines.append(cleaned)
        if not _HATNOTE_RE.match(cleaned):
            prose_lines.append(cleaned)

    chosen = prose_lines if prose_lines else fallback_lines
    sentences: list[str] = []
    for line in chosen:
        sentences.extend(_split_paragraph_sentences(line))
    return sentences


def extractive_section_summary(section_text: str) -> tuple[str, str]:
    sents = extract_prose_sentences(section_text)
    if not sents:
        return "", ""
    return sents[0], " ".join(sents[:3])


def extractive_tldr(text: str) -> str:
    sents = extract_prose_sentences(text)
    return " ".join(sents[:3])


def split_markdown_sections(text: str) -> tuple[str, list[dict[str, Any]], set[str]]:
    """Split article Markdown into lead, filtered kept sections (numbered 1..n), and all H2 keys."""
    lines = text.splitlines()
    h2_indices = [idx for idx, line in enumerate(lines) if line.startswith("## ")]
    lead_end = h2_indices[0] if h2_indices else len(lines)
    lead_start = 1 if lines and lines[0].startswith("# ") else 0
    lead = "\n".join(lines[lead_start:lead_end]).strip()

    kept: list[dict[str, Any]] = []
    all_h2_keys: set[str] = set()
    for pos, start_idx in enumerate(h2_indices):
        end_idx = h2_indices[pos + 1] if pos + 1 < len(h2_indices) else len(lines)
        heading = lines[start_idx][3:].strip()
        heading_key = heading.casefold()
        all_h2_keys.add(heading_key)
        sec_text = "\n".join(lines[start_idx:end_idx]).strip()
        sec_words = count_words(sec_text)
        if heading_key in DROP_HEADINGS or sec_words < 20:
            continue
        kept.append(
            {
                "no": len(kept) + 1,
                "heading": heading,
                "words": sec_words,
                "reading_minutes": reading_minutes(sec_words),
                "text": sec_text,
            }
        )
    return lead, kept, all_h2_keys


def _find_verbatim_span(norm_source: str, input_text: str) -> str | None:
    tokens = norm_source.split()
    if not tokens:
        return None
    pattern = r"\s+".join(re.escape(tok) for tok in tokens)
    match = re.search(pattern, input_text)
    return match.group(0) if match else None


def filter_grounded_facts(
    raw_facts: Any,
    input_text: str,
) -> tuple[list[dict[str, str]], int, int]:
    """Keep facts whose whitespace-normalized `source` is a substring of `input_text`."""
    if not isinstance(raw_facts, list):
        return [], 0, 0
    norm_input = normalize_ws(input_text)
    kept: list[dict[str, str]] = []
    dropped = 0
    for item in raw_facts:
        if not isinstance(item, dict):
            dropped += 1
            continue
        label = str(item.get("label", "")).strip()
        value = str(item.get("value", "")).strip()
        source = str(item.get("source", "")).strip()
        norm_src = normalize_ws(source)
        if not label or not value or not norm_src or norm_src not in norm_input:
            dropped += 1
            continue
        verbatim = _find_verbatim_span(norm_src, input_text) or source
        if len(kept) < 3:
            kept.append({"label": label, "value": value, "source": verbatim})
    return kept, len(kept), dropped


def split_wikitext_h2_sections(wikitext: str) -> list[tuple[str, str]]:
    """Extract ordered (heading, raw_body) pairs for level-2 headings in wikitext."""
    matches = list(_WIKITEXT_H2_RE.finditer(wikitext))
    sections: list[tuple[str, str]] = []
    for idx, match in enumerate(matches):
        heading = match.group(1).strip()
        start = match.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(wikitext)
        sections.append((heading, wikitext[start:end]))
    return sections


def _truncate_word_boundary(text: str, max_chars: int = GHOST_TEXT_MAX_CHARS) -> str:
    text = text.strip()
    if len(text) <= max_chars:
        return text
    limit = max_chars - 1
    cut = text[: limit + 1]
    idx = max(cut.rfind(" "), cut.rfind("\n"))
    if idx > 0:
        return cut[:idx].rstrip() + "…"
    return text[:limit].rstrip() + "…"


def _clean_section_key(blocks: list[tuple[str, str]]) -> str:
    return "\n".join(f"{kind}:{text}" for kind, text in blocks)


def compute_history_and_ghosts(
    snapshots: list[tuple[int, int, str]],
    current_sections: list[dict[str, Any]],
    all_current_headings: set[str] | None = None,
    war_years_set: set[int] | None = None,
    current_year: int | None = None,
) -> tuple[dict[int, dict[str, Any]], list[dict[str, Any]]]:
    """Compute per-section edit history and ghost sections from chronological snapshots.

    `snapshots` is an ordered list of `(year, rev_id, raw_wikitext)` ending with the latest row.
    """
    if current_year is None:
        current_year = datetime.now(timezone.utc).year
    war_set = war_years_set or set()

    if not snapshots:
        default_hist = {
            sec["no"]: {"added_year": current_year, "changes": 0, "war_years": []}
            for sec in current_sections
        }
        return default_hist, []

    current_no_by_key = {sec["heading"].strip().casefold(): int(sec["no"]) for sec in current_sections}
    current_keys = (
        all_current_headings
        if all_current_headings is not None
        else set(current_no_by_key.keys())
    )

    parsed_snaps: list[dict[str, Any]] = []
    occurrences: dict[str, list[tuple[int, int, int, str]]] = {}

    for snap_idx, (yr, rev_id, wikitext) in enumerate(snapshots):
        ordered: list[tuple[str, str]] = []
        raw_bodies: dict[str, list[str]] = {}
        for heading, body in split_wikitext_h2_sections(wikitext):
            key = heading.strip().casefold()
            ordered.append((key, heading))
            raw_bodies.setdefault(key, []).append(body)
            occurrences.setdefault(key, []).append((snap_idx, int(yr), int(rev_id), heading))
        parsed_snaps.append(
            {
                "year": int(yr),
                "rev_id": int(rev_id),
                "ordered": ordered,
                "raw_bodies": raw_bodies,
                "keys": set(raw_bodies.keys()),
                "cleaned": {},
            }
        )

    def get_cleaned_blocks(snap_idx: int, key: str) -> list[tuple[str, str]]:
        snap = parsed_snaps[snap_idx]
        if key not in snap["cleaned"]:
            combined = "\n".join(snap["raw_bodies"][key])
            snap["cleaned"][key] = history.clean(combined)
        return snap["cleaned"][key]

    history_by_no: dict[int, dict[str, Any]] = {}
    for sec in current_sections:
        no = int(sec["no"])
        key = sec["heading"].strip().casefold()
        occ = occurrences.get(key, [])
        added_year = occ[0][1] if occ else current_year
        changes = 0
        changed_years: set[int] = set()
        for idx in range(1, len(parsed_snaps)):
            prev_snap = parsed_snaps[idx - 1]
            curr_snap = parsed_snaps[idx]
            if key in prev_snap["keys"] and key in curr_snap["keys"]:
                prev_clean = _clean_section_key(get_cleaned_blocks(idx - 1, key))
                curr_clean = _clean_section_key(get_cleaned_blocks(idx, key))
                if prev_clean != curr_clean:
                    changes += 1
                    changed_years.add(prev_snap["year"])
        history_by_no[no] = {
            "added_year": added_year,
            "changes": changes,
            "war_years": sorted(y for y in changed_years if y in war_set),
        }

    # shortcut: renamed sections may show up as ghosts
    last_keys = parsed_snaps[-1]["keys"]
    ghost_candidates: list[dict[str, Any]] = []
    for key, occ in occurrences.items():
        # Deduplicate multiple occurrences of the same heading within a single snapshot.
        unique_snaps = []
        seen_idx: set[int] = set()
        for item in occ:
            if item[0] not in seen_idx:
                seen_idx.add(item[0])
                unique_snaps.append(item)

        if len(unique_snaps) < 2:
            continue
        if key in last_keys or key in current_keys or key in DROP_HEADINGS:
            continue

        from_year = unique_snaps[0][1]
        last_idx, _, oldid, display_heading = unique_snaps[-1]
        removed_year = parsed_snaps[last_idx + 1]["year"]

        blocks = get_cleaned_blocks(last_idx, key)
        paras = [txt.strip() for kind, txt in blocks if kind == "p" and txt.strip()]
        if not paras:
            paras = [f"- {txt.strip()}" for kind, txt in blocks if kind == "li" and txt.strip()]
        ghost_text = _truncate_word_boundary("\n\n".join(paras), GHOST_TEXT_MAX_CHARS)
        if not ghost_text:
            continue

        ordered = parsed_snaps[last_idx]["ordered"]
        pos = next(i for i, (hk, _) in enumerate(ordered) if hk == key)
        after_no = 0
        for j in range(pos - 1, -1, -1):
            prev_key = ordered[j][0]
            if prev_key in current_no_by_key:
                after_no = current_no_by_key[prev_key]
                break

        ghost_candidates.append(
            {
                "after_no": after_no,
                "heading": display_heading,
                "from_year": from_year,
                "removed_year": removed_year,
                "text": ghost_text,
                "oldid": oldid,
                "_span": removed_year - from_year,
                "_count": len(unique_snaps),
            }
        )

    ghost_candidates.sort(
        key=lambda g: (
            -g["_span"],
            -g["_count"],
            -len(g["text"]),
            g["after_no"],
            g["heading"],
        )
    )
    top_ghosts = ghost_candidates[:MAX_GHOSTS]
    top_ghosts.sort(key=lambda g: (g["after_no"], g["from_year"], g["heading"]))
    for g in top_ghosts:
        g.pop("_span", None)
        g.pop("_count", None)

    return history_by_no, top_ghosts


def _parse_year(val: Any) -> int:
    if isinstance(val, datetime):
        return val.year
    return int(str(val)[:4])


def _fetch_svt_history_and_ghosts(
    svt_cur: mariadb.Cursor,
    page_id: int,
    current_svt_row: dict[str, Any],
    current_sections: list[dict[str, Any]],
    all_current_headings: set[str],
) -> tuple[dict[int, dict[str, Any]], list[dict[str, Any]]]:
    first_dt = None
    try:
        svt_cur.execute(SVT_FIRST_STATS_SQL, (page_id,))
        row = svt_cur.fetchone()
        if row and row[0] is not None:
            first_dt = row[0]
    except mariadb.ProgrammingError:
        first_dt = None

    if first_dt is None:
        svt_cur.execute(SVT_FIRST_ROW_START_SQL, (page_id,))
        row = svt_cur.fetchone()
        first_dt = row[0] if row else current_svt_row["row_start"]

    first_year = _parse_year(first_dt)
    now_year = datetime.now(timezone.utc).year
    end_year = max(now_year, _parse_year(current_svt_row["row_start"]))

    snapshots: list[tuple[int, int, str]] = []
    for yr in range(first_year + 1, end_year + 1):
        snap = history.as_of(svt_cur, page_id, f"{yr:04d}-01-01 00:00:00")
        if snap is not None:
            snapshots.append((yr, int(snap["rev_id"]), snap["text"]))
    snapshots.append((end_year, int(current_svt_row["rev_id"]), current_svt_row["text"]))

    war_years_set: set[int] = set()
    try:
        svt_cur.execute(SVT_WAR_YEARS_SQL, (page_id,))
        war_years_set = {int(r[0]) for r in svt_cur.fetchall()}
    except mariadb.ProgrammingError:
        war_years_set = set()

    return compute_history_and_ghosts(
        snapshots=snapshots,
        current_sections=current_sections,
        all_current_headings=all_current_headings,
        war_years_set=war_years_set,
        current_year=end_year,
    )


def _call_llm_json(
    client: Any,
    model: str,
    schema: dict[str, Any],
    user_content: str,
    system_prompt: str = SYSTEM_PROMPT,
) -> tuple[dict[str, Any] | None, int, int]:
    """Call the Anthropic Messages API with strict JSON schema output.

    Returns (parsed_dict_or_None, input_tokens, output_tokens).
    """
    try:
        resp = client.messages.create(
            model=model,
            max_tokens=4000,
            output_config={
                "effort": "low",
                "format": {"type": "json_schema", "schema": schema},
            },
            system=system_prompt,
            messages=[{"role": "user", "content": user_content}],
        )
    except Exception as exc:
        status = getattr(exc, "status_code", None)
        logger.warning("Anthropic call failed (%s status=%s)", type(exc).__name__, status)
        return None, 0, 0

    usage = getattr(resp, "usage", None)
    in_tok = int(getattr(usage, "input_tokens", 0) or 0)
    out_tok = int(getattr(usage, "output_tokens", 0) or 0)

    stop_reason = getattr(resp, "stop_reason", None)
    if stop_reason != "end_turn":
        logger.warning("Anthropic call stopped with stop_reason=%r", stop_reason)
        return None, in_tok, out_tok

    first_text = None
    for block in getattr(resp, "content", None) or []:
        if getattr(block, "type", None) == "text" and hasattr(block, "text"):
            first_text = block.text
            break
        if isinstance(block, dict) and block.get("type") == "text":
            first_text = block.get("text")
            break
    if not first_text:
        logger.warning("Anthropic response contained no text block")
        return None, in_tok, out_tok

    try:
        parsed = json.loads(first_text)
    except Exception as exc:
        logger.warning("Anthropic response was not valid JSON (%s)", type(exc).__name__)
        return None, in_tok, out_tok

    if not isinstance(parsed, dict):
        logger.warning("Anthropic response JSON root was not an object")
        return None, in_tok, out_tok

    return parsed, in_tok, out_tok


def _default_anthropic_client() -> Any:
    import anthropic

    return anthropic.Anthropic()


def build_summary_payload(
    article_row: dict[str, Any],
    has_history: bool,
    current_svt_row: dict[str, Any] | None = None,
    svt_cur: mariadb.Cursor | None = None,
    use_llm: bool = False,
    llm_client: Any = None,
    model: str | None = None,
    max_workers: int = 4,
    precomputed_history: tuple[dict[int, dict[str, Any]], list[dict[str, Any]]] | None = None,
) -> tuple[dict[str, Any], BuildStats]:
    """Assemble the full /api/summary/{lang}/{page_id} response dict and build stats."""
    lang = str(article_row["lang"])
    page_id = int(article_row["page_id"])
    rev_id = int(article_row["rev_id"])
    text = str(article_row["text"])
    article_words = count_words(text)

    lead, kept_sections, all_h2_keys = split_markdown_sections(text)
    is_short = (article_words < 1500) or (len(kept_sections) < 4)

    article_meta = {
        "lang": lang,
        "page_id": page_id,
        "wikidata_id": article_row["wikidata_id"],
        "title": article_row["title"],
        "url": article_row["url"],
        "words": article_words,
        "reading_minutes": reading_minutes(article_words),
        "has_history": bool(has_history),
    }

    article_source_text = lead if count_words(lead) >= 40 else (text if is_short else text[:12000])
    fallback_tldr = extractive_tldr(article_source_text)

    stats = BuildStats()

    if is_short:
        sections_out: list[dict[str, Any]] = []
        ghosts_out: list[dict[str, Any]] = []
    else:
        if precomputed_history is not None:
            history_by_no, ghosts_out = precomputed_history
        elif has_history and current_svt_row is not None and svt_cur is not None:
            history_by_no, ghosts_out = _fetch_svt_history_and_ghosts(
                svt_cur=svt_cur,
                page_id=page_id,
                current_svt_row=current_svt_row,
                current_sections=kept_sections,
                all_current_headings=all_h2_keys,
            )
        else:
            history_by_no = {}
            ghosts_out = []

        sections_out = []
        for sec in kept_sections:
            one_line, summary_txt = extractive_section_summary(sec["text"])
            sections_out.append(
                {
                    "no": sec["no"],
                    "heading": sec["heading"],
                    "words": sec["words"],
                    "reading_minutes": sec["reading_minutes"],
                    "one_line": one_line,
                    "summary": summary_txt,
                    "facts": [],
                    "text": sec["text"],
                    "history": history_by_no.get(sec["no"]) if has_history else None,
                }
            )

    tldr = fallback_tldr
    article_facts: list[dict[str, str]] = []

    if use_llm:
        resolved_model = model or os.environ.get("SUMMARY_MODEL") or SUMMARY_MODEL_DEFAULT
        client = llm_client if llm_client is not None else _default_anthropic_client()

        headings_line = (
            f"\n\nSections: {', '.join(s['heading'] for s in kept_sections)}"
            if kept_sections and not is_short
            else ""
        )
        article_prompt = f"Title: {article_row['title']}\n\n{article_source_text}{headings_line}"

        def summarize_article() -> tuple[str, list[dict[str, str]], int, int, int, int, bool]:
            parsed, in_t, out_t = _call_llm_json(client, resolved_model, ARTICLE_SCHEMA, article_prompt)
            if parsed is None or not str(parsed.get("tldr", "")).strip():
                return fallback_tldr, [], 0, 0, in_t, out_t, True
            facts_kept, kept_n, dropped_n = filter_grounded_facts(
                parsed.get("facts", []),
                article_source_text,
            )
            return str(parsed["tldr"]).strip(), facts_kept, kept_n, dropped_n, in_t, out_t, False

        def summarize_section(
            sec_item: dict[str, Any],
        ) -> tuple[str, str, list[dict[str, str]], int, int, int, int, bool]:
            parsed, in_t, out_t = _call_llm_json(client, resolved_model, SECTION_SCHEMA, sec_item["text"])
            if parsed is None:
                return sec_item["one_line"], sec_item["summary"], [], 0, 0, in_t, out_t, True
            one_line_val = str(parsed.get("one_line", "")).strip()
            summary_val = str(parsed.get("summary", "")).strip()
            if not one_line_val or not summary_val:
                return sec_item["one_line"], sec_item["summary"], [], 0, 0, in_t, out_t, True
            facts_kept, kept_n, dropped_n = filter_grounded_facts(
                parsed.get("facts", []),
                sec_item["text"],
            )
            return one_line_val, summary_val, facts_kept, kept_n, dropped_n, in_t, out_t, False

        worker_count = max(1, min(max_workers, 1 + len(sections_out)))
        with ThreadPoolExecutor(max_workers=worker_count) as pool:
            art_future = pool.submit(summarize_article)
            sec_futures = [pool.submit(summarize_section, s) for s in sections_out]

            tldr, article_facts, kept_n, dropped_n, in_t, out_t, failed = art_future.result()
            stats.total_calls += 1
            stats.facts_kept += kept_n
            stats.facts_dropped += dropped_n
            stats.input_tokens += in_t
            stats.output_tokens += out_t
            if failed:
                stats.failed_calls += 1

            for sec_item, fut in zip(sections_out, sec_futures):
                one_line_v, summary_v, s_facts, s_kept, s_drop, in_t, out_t, failed = fut.result()
                sec_item["one_line"] = one_line_v
                sec_item["summary"] = summary_v
                sec_item["facts"] = s_facts
                stats.total_calls += 1
                stats.facts_kept += s_kept
                stats.facts_dropped += s_drop
                stats.input_tokens += in_t
                stats.output_tokens += out_t
                if failed:
                    stats.failed_calls += 1

    stats.sections = len(sections_out)
    stats.ghosts = len(ghosts_out)

    payload = {
        "article": article_meta,
        "mode": "llm" if use_llm else "extractive",
        "rev_id": rev_id,
        "tldr": tldr,
        "facts": article_facts,
        "sections": sections_out,
        "ghost_sections": ghosts_out,
    }
    return payload, stats


def _fetch_article_and_svt_row(
    rag_cur: mariadb.Cursor,
    lang: str,
    page_id: int,
) -> tuple[dict[str, Any], bool, dict[str, Any] | None]:
    rag_cur.execute(ARTICLE_SQL, (lang, page_id))
    fetched = rag_cur.fetchone()
    if fetched is None:
        raise HTTPException(status_code=404, detail=f"Article {lang}:{page_id} not found")
    cols = [d[0] for d in rag_cur.description]
    article_row = dict(zip(cols, fetched))

    has_history = False
    svt_row = None
    if lang == "fi":
        svt_con = _open_svt()
        try:
            svt_cur = svt_con.cursor()
            try:
                found = history.rows(svt_cur, SVT_CURRENT_ROW_SQL, (page_id,))
                if found:
                    has_history = True
                    svt_row = found[0]
            finally:
                svt_cur.close()
        finally:
            svt_con.close()
    return article_row, has_history, svt_row


def build_and_cache_llm_summary(
    lang: str,
    page_id: int,
    force: bool = False,
    llm_client: Any = None,
    model: str | None = None,
) -> tuple[dict[str, Any], BuildStats, bool]:
    """Build the LLM summary synchronously and write wikirag.summary_cache.

    Returns (payload, stats, from_cache).
    """
    ensure_cache_table()
    rag_con = _open_rag()
    try:
        rag_cur = rag_con.cursor()
        try:
            article_row, has_history, svt_row = _fetch_article_and_svt_row(rag_cur, lang, page_id)
            rev_id = int(article_row["rev_id"])

            if not force:
                rag_cur.execute(CACHE_GET_SQL, (lang, page_id, rev_id))
                cached = rag_cur.fetchone()
                if cached is not None:
                    cached_payload = json.loads(cached[0])
                    stats = BuildStats(
                        sections=len(cached_payload.get("sections", [])),
                        ghosts=len(cached_payload.get("ghost_sections", [])),
                    )
                    return cached_payload, stats, True
        finally:
            rag_cur.close()
    finally:
        rag_con.close()

    svt_con = _open_svt() if has_history else None
    try:
        svt_cur = svt_con.cursor() if svt_con is not None else None
        try:
            payload, stats = build_summary_payload(
                article_row=article_row,
                has_history=has_history,
                current_svt_row=svt_row,
                svt_cur=svt_cur,
                use_llm=True,
                llm_client=llm_client,
                model=model,
            )
        finally:
            if svt_cur is not None:
                svt_cur.close()
    finally:
        if svt_con is not None:
            svt_con.close()

    if stats.total_calls > 0 and stats.failed_calls == stats.total_calls:
        logger.error(
            "All %d LLM calls failed for %s:%s@%s; skipping cache write",
            stats.total_calls,
            lang,
            page_id,
            article_row["rev_id"],
        )
        return payload, stats, False

    serialized = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    rag_write = _open_rag()
    try:
        cur = rag_write.cursor()
        try:
            cur.execute(CACHE_PUT_SQL, (lang, page_id, int(article_row["rev_id"]), serialized))
            rag_write.commit()
        finally:
            cur.close()
    finally:
        rag_write.close()

    return payload, stats, False


def _background_llm_worker(key: tuple[str, int, int], llm_client: Any = None) -> None:
    lang, page_id, rev_id = key
    try:
        if llm_client is None and not os.environ.get("ANTHROPIC_API_KEY"):
            logger.warning("ANTHROPIC_API_KEY unset; skipping background summary for %s:%s", lang, page_id)
            return
        build_and_cache_llm_summary(lang, page_id, llm_client=llm_client)
    except Exception:
        logger.exception("Background LLM summary job failed for %s:%s@%s", lang, page_id, rev_id)
    finally:
        with _inflight_lock:
            _inflight_jobs.discard(key)


def _summary_llm_enabled() -> bool:
    return os.environ.get("SUMMARY_LLM", "1").strip() != "0"


def get_summary_response(
    lang: str,
    page_id: int,
    background_tasks: BackgroundTasks,
    rag_opener: Callable[[], mariadb.Connection] | None = None,
    svt_opener: Callable[[], mariadb.Connection] | None = None,
    llm_client: Any = None,
) -> Response:
    """Handle GET /api/summary/{lang}/{page_id} without ever awaiting an LLM call."""
    if lang not in VALID_LANGS:
        raise HTTPException(status_code=404, detail=f"Unknown language: {lang}")

    open_rag = rag_opener or _open_rag
    open_svt = svt_opener or _open_svt

    rag_con = open_rag()
    try:
        ensure_cache_table(rag_con)
        rag_cur = rag_con.cursor()
        try:
            rag_cur.execute(ARTICLE_SQL, (lang, page_id))
            fetched = rag_cur.fetchone()
            if fetched is None:
                raise HTTPException(status_code=404, detail=f"Article {lang}:{page_id} not found")
            cols = [d[0] for d in rag_cur.description]
            article_row = dict(zip(cols, fetched))
            rev_id = int(article_row["rev_id"])

            rag_cur.execute(CACHE_GET_SQL, (lang, page_id, rev_id))
            cached = rag_cur.fetchone()
            if cached is not None:
                return Response(content=cached[0], media_type="application/json")
        finally:
            rag_cur.close()
    finally:
        rag_con.close()

    has_history = False
    svt_row = None
    svt_con = None
    svt_cur = None
    try:
        if lang == "fi":
            svt_con = open_svt()
            svt_cur = svt_con.cursor()
            found = history.rows(svt_cur, SVT_CURRENT_ROW_SQL, (page_id,))
            if found:
                has_history = True
                svt_row = found[0]

        payload, _ = build_summary_payload(
            article_row=article_row,
            has_history=has_history,
            current_svt_row=svt_row,
            svt_cur=svt_cur,
            use_llm=False,
        )
    finally:
        if svt_cur is not None:
            svt_cur.close()
        if svt_con is not None:
            svt_con.close()

    job_key = (lang, page_id, rev_id)
    if _summary_llm_enabled():
        should_schedule = False
        with _inflight_lock:
            if job_key not in _inflight_jobs:
                _inflight_jobs.add(job_key)
                should_schedule = True
        if should_schedule:
            background_tasks.add_task(_background_llm_worker, job_key, llm_client)

    body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    return Response(content=body, media_type="application/json")
