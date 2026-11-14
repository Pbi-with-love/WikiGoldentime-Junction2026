#!/usr/bin/env python3
"""Fetch Wikipedia lead images (PageImages) and Commons credits into wikirag.article_image.

Reads (lang, page_id) from wikirag.article, queries {lang}.wikipedia.org PageImages API in
batches of up to 50 page IDs, verifies Commons existence and credit metadata (LicenseShortName,
LicenseUrl, Artist, NonFree) on commons.wikimedia.org, and upserts valid rows into
wikirag.article_image. With --credits-only, refreshes Commons credits for existing rows.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from email.utils import parsedate_to_datetime
import gzip
import html
from html.parser import HTMLParser
import http.client
import json
import os
import re
import sys
import time
from typing import Any
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_UA = (
    "wikimemory/0.2 "
    "(https://github.com/Pbi-with-love/WikiGoldentime-Junction2026; Junction 2026 hackathon demo) "
    "python-urllib/3"
)
DEFAULT_PROGRESS_FILE = os.path.expanduser("~/wikimemory/fetch_images.progress.json")
DEFAULT_CREDIT_PROGRESS_FILE = os.path.expanduser(
    "~/wikimemory/fetch_images_credit_missing.progress.json"
)
LANGS = ("en", "fi", "sv")
BATCH_SIZE = 50
MIN_REQUEST_INTERVAL_S = 1.05
REQUEST_TIMEOUT_S = 30
BACKOFF_SECONDS = (5, 10, 20, 40, 80)
MAX_TRIES = 5
MAX_GET_URL_LEN = 7000
EF_SEARCH = 80
MAX_FILE_NAME_LEN = 255
MAX_THUMB_URL_LEN = 1024
MAX_LICENSE_LEN = 64
MAX_LICENSE_URL_LEN = 512
MAX_ARTIST_LEN = 512
MAX_CREDIT_LEN = 200
NON_FREE_LICENSE_RE = re.compile(r"non-free|fair use", re.IGNORECASE)

ALLOWED_THUMB_PREFIXES = (
    "https://thumb.wikimedia.org/",
    "https://upload.wikimedia.org/",
)

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS article_image (
  lang CHAR(2) NOT NULL,
  page_id INT(10) UNSIGNED NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  thumb_url VARCHAR(1024) NOT NULL,
  license VARCHAR(64) NULL,
  license_url VARCHAR(512) NULL,
  artist VARCHAR(512) NULL,
  credit VARCHAR(200) NULL,
  non_free TINYINT(1) NOT NULL DEFAULT 0,
  credit_checked_at DATETIME NULL,
  PRIMARY KEY (lang, page_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci
"""

UPSERT_SQL = """
INSERT INTO article_image (
  lang, page_id, file_name, thumb_url, license, license_url, artist, credit, non_free, credit_checked_at
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE
  file_name = VALUES(file_name),
  thumb_url = VALUES(thumb_url),
  license = VALUES(license),
  license_url = VALUES(license_url),
  artist = VALUES(artist),
  credit = VALUES(credit),
  non_free = VALUES(non_free),
  credit_checked_at = UTC_TIMESTAMP()
"""

UPDATE_CREDITS_SQL = """
UPDATE article_image
SET license = ?,
    license_url = ?,
    artist = ?,
    credit = ?,
    non_free = ?,
    credit_checked_at = UTC_TIMESTAMP()
WHERE file_name = ?
"""

UPDATE_MISSING_ARTIST_CREDIT_SQL = """
UPDATE article_image
SET credit = ?
WHERE file_name = ?
  AND (artist IS NULL OR artist = '')
"""

MARK_MISSING_CREDITS_SQL = """
UPDATE article_image
SET credit_checked_at = UTC_TIMESTAMP()
WHERE file_name = ?
"""

BLOCK_TAGS = frozenset(
    {
        "address",
        "article",
        "aside",
        "blockquote",
        "br",
        "dd",
        "div",
        "dl",
        "dt",
        "figcaption",
        "figure",
        "footer",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "header",
        "hr",
        "li",
        "nav",
        "ol",
        "p",
        "pre",
        "section",
        "table",
        "td",
        "th",
        "tr",
        "ul",
    }
)


class _TextExtractor(HTMLParser):
    """Strip HTML tags while preserving spacing across block/line-break elements."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self._parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() in BLOCK_TAGS:
            self._parts.append(" ")

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in BLOCK_TAGS:
            self._parts.append(" ")

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() in BLOCK_TAGS:
            self._parts.append(" ")

    def handle_data(self, data: str) -> None:
        self._parts.append(data)

    def handle_entityref(self, name: str) -> None:
        self._parts.append(f"&{name};")

    def handle_charref(self, name: str) -> None:
        self._parts.append(f"&#{name};")

    def get_text(self) -> str:
        return "".join(self._parts)


@dataclass(frozen=True)
class CommonsMeta:
    license: str | None
    license_url: str | None
    artist: str | None
    credit: str | None = None
    non_free: bool = False


@dataclass(frozen=True)
class PageImageCandidate:
    page_id: int
    file_name: str
    thumb_url: str


@dataclass
class PageImagesBatchResult:
    candidates: list[PageImageCandidate]
    no_image: int = 0
    missing_pages: int = 0
    non_commons_dropped: int = 0


def clean_metadata_text(raw: Any, max_len: int) -> str | None:
    """Strip HTML tags, unescape entities, collapse whitespace, and truncate."""
    if raw is None:
        return None
    text = str(raw)
    if not text.strip():
        return None
    parser = _TextExtractor()
    parser.feed(text)
    parser.close()
    unescaped = html.unescape(parser.get_text())
    collapsed = " ".join(unescaped.split())
    if not collapsed:
        return None
    return collapsed[:max_len]


def clean_license_url(raw: Any) -> str | None:
    """Normalize Commons LicenseUrl and allow only http(s):// URLs."""
    cleaned = clean_metadata_text(raw, MAX_LICENSE_URL_LEN)
    if not cleaned:
        return None
    if cleaned.startswith("//"):
        cleaned = "https:" + cleaned
    if not (cleaned.startswith("https://") or cleaned.startswith("http://")):
        return None
    parts = urllib.parse.urlsplit(cleaned)
    if parts.scheme not in ("http", "https") or not parts.netloc:
        return None
    return cleaned[:MAX_LICENSE_URL_LEN]


def parse_non_free(non_free_raw: Any, license_short: str | None) -> bool:
    """Return True if Commons NonFree metadata or licence text flags a non-free file."""
    if isinstance(non_free_raw, bool):
        if non_free_raw:
            return True
    elif isinstance(non_free_raw, int):
        if non_free_raw == 1:
            return True
    elif non_free_raw is not None:
        if str(non_free_raw).strip().lower() in ("true", "1"):
            return True
    if license_short and NON_FREE_LICENSE_RE.search(license_short):
        return True
    return False


def sanitize_thumb_url(raw_url: str | None) -> str | None:
    """Strip utm_* tracking query params and validate Wikimedia thumbnail origin."""
    if not raw_url:
        return None
    parts = urllib.parse.urlsplit(raw_url.strip())
    if parts.scheme != "https" or not parts.netloc:
        return None
    kept_params = [
        (k, v)
        for k, v in urllib.parse.parse_qsl(parts.query, keep_blank_values=True)
        if not k.lower().startswith("utm_")
    ]
    clean_query = urllib.parse.urlencode(kept_params)
    cleaned = urllib.parse.urlunsplit((parts.scheme, parts.netloc, parts.path, clean_query, ""))
    if not cleaned.startswith(ALLOWED_THUMB_PREFIXES):
        return None
    if "?" in cleaned:
        return None
    return cleaned


def is_commons_thumb_url(thumb_url: str) -> bool:
    """Return True only when the URL points to Wikimedia Commons media storage."""
    path = urllib.parse.urlsplit(thumb_url).path
    return path.startswith("/wikipedia/commons/")


def parse_retry_after(value: str | None) -> float | None:
    """Parse Retry-After header (seconds or HTTP-date) into non-negative delay seconds."""
    if not value:
        return None
    stripped = value.strip()
    try:
        delay = float(stripped)
        return max(0.0, delay)
    except ValueError:
        pass
    try:
        dt = parsedate_to_datetime(stripped)
        delay = dt.timestamp() - time.time()
        return max(0.0, delay)
    except (TypeError, ValueError, OverflowError):
        return None


class PoliteClient:
    """Single-threaded rate-limited Wikimedia API client with Retry-After and backoff."""

    def __init__(self, user_agent: str, min_interval_s: float = MIN_REQUEST_INTERVAL_S) -> None:
        self.user_agent = user_agent
        self.min_interval_s = min_interval_s
        self.last_request_end = 0.0
        self.request_count = 0

    def _pace(self) -> None:
        if self.last_request_end > 0.0:
            elapsed = time.monotonic() - self.last_request_end
            if elapsed < self.min_interval_s:
                time.sleep(self.min_interval_s - elapsed)

    def get_json(self, base_url: str, params: dict[str, str]) -> dict[str, Any]:
        """Execute one GET request with retries on 429/5xx, maxlag, and transient errors."""
        query = urllib.parse.urlencode(params, safe="|:")
        url = f"{base_url}?{query}"

        for attempt in range(MAX_TRIES):
            self._pace()
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": self.user_agent,
                    "Accept-Encoding": "gzip",
                    "Accept": "application/json",
                },
            )
            retry_after: float | None = None
            err_reason: str | None = None

            try:
                self.request_count += 1
                with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_S) as resp:
                    raw = resp.read()
                    encoding = (resp.headers.get("Content-Encoding") or "").lower()
                    retry_after = parse_retry_after(resp.headers.get("Retry-After"))
                self.last_request_end = time.monotonic()

                if "gzip" in encoding or raw.startswith(b"\x1f\x8b"):
                    raw = gzip.decompress(raw)
                data = json.loads(raw.decode("utf-8"))

                if isinstance(data, dict) and "error" in data:
                    err = data["error"]
                    err_code = str(err.get("code", "unknown"))
                    err_info = str(err.get("info", ""))
                    if err_code in ("maxlag", "ratelimited", "readonly") or "lag" in err_code:
                        err_reason = f"API {err_code}: {err_info}"
                    else:
                        raise RuntimeError(f"MediaWiki API error {err_code}: {err_info}")
                else:
                    return data

            except urllib.error.HTTPError as exc:
                self.last_request_end = time.monotonic()
                retry_after = parse_retry_after(exc.headers.get("Retry-After") if exc.headers else None)
                exc.close()
                if exc.code == 429 or 500 <= exc.code < 600:
                    err_reason = f"HTTP {exc.code}: {exc.reason}"
                else:
                    raise RuntimeError(f"HTTP {exc.code}: {exc.reason}") from exc

            except (
                urllib.error.URLError,
                http.client.HTTPException,
                TimeoutError,
                OSError,
                gzip.BadGzipFile,
                json.JSONDecodeError,
            ) as exc:
                self.last_request_end = time.monotonic()
                err_reason = f"{type(exc).__name__}: {exc}"

            if attempt == MAX_TRIES - 1:
                raise RuntimeError(f"Failed after {MAX_TRIES} tries ({err_reason})")

            delay = retry_after if retry_after is not None else BACKOFF_SECONDS[attempt]
            delay = max(delay, self.min_interval_s)
            print(
                f"  retry {attempt + 1}/{MAX_TRIES - 1} in {delay:.1f}s ({err_reason})",
                flush=True,
            )
            time.sleep(delay)

        raise RuntimeError("Unreachable retry loop exit")


def merge_pageimages_responses(responses: list[dict[str, Any]]) -> dict[int, dict[str, Any]]:
    """Merge paginated MediaWiki query.pages entries keyed by pageid."""
    merged: dict[int, dict[str, Any]] = {}
    for data in responses:
        pages = (data.get("query") or {}).get("pages") or []
        for page in pages:
            pid = int(page["pageid"])
            cur = merged.setdefault(pid, {"pageid": pid})
            if page.get("missing"):
                cur["missing"] = True
            if "title" in page:
                cur["title"] = page["title"]
            if "pageimage" in page:
                cur["pageimage"] = page["pageimage"]
            if "thumbnail" in page:
                cur["thumbnail"] = page["thumbnail"]
    return merged


def extract_pageimage_candidates(
    requested_page_ids: list[int],
    merged_pages: dict[int, dict[str, Any]],
) -> PageImagesBatchResult:
    """Classify merged PageImages pages into candidates, no_image, missing, or local dropped."""
    result = PageImagesBatchResult(candidates=[])
    for pid in requested_page_ids:
        page = merged_pages.get(pid)
        if page is None or page.get("missing"):
            result.missing_pages += 1
            continue
        file_name = page.get("pageimage")
        thumb_source = (page.get("thumbnail") or {}).get("source")
        if not file_name or not thumb_source:
            result.no_image += 1
            continue
        if file_name.startswith("File:"):
            file_name = file_name[len("File:") :]
        thumb_url = sanitize_thumb_url(thumb_source)
        if thumb_url is None:
            result.non_commons_dropped += 1
            continue
        if not is_commons_thumb_url(thumb_url):
            result.non_commons_dropped += 1
            continue
        if len(file_name) > MAX_FILE_NAME_LEN or len(thumb_url) > MAX_THUMB_URL_LEN:
            print(
                f"  warning: oversized file_name/thumb_url for page_id={pid}, dropping",
                flush=True,
            )
            result.non_commons_dropped += 1
            continue
        result.candidates.append(
            PageImageCandidate(page_id=pid, file_name=file_name, thumb_url=thumb_url)
        )
    return result


def fetch_paginated_query(
    client: PoliteClient,
    base_url: str,
    base_params: dict[str, str],
) -> list[dict[str, Any]]:
    """Run a MediaWiki action=query request and follow any continue tokens."""
    responses: list[dict[str, Any]] = []
    cont_params: dict[str, str] = {}
    seen_cont: set[tuple[tuple[str, str], ...]] = set()

    while True:
        params = {**base_params, **cont_params}
        data = client.get_json(base_url, params)
        responses.append(data)
        cont = data.get("continue")
        if not cont or not isinstance(cont, dict):
            break
        cont_params = {str(k): str(v) for k, v in cont.items()}
        sig = tuple(sorted(cont_params.items()))
        if sig in seen_cont or len(responses) >= BATCH_SIZE:
            break
        seen_cont.add(sig)

    return responses


def fetch_pageimages_batch(
    client: PoliteClient,
    lang: str,
    page_ids: list[int],
) -> PageImagesBatchResult:
    """Fetch PageImages metadata for <=50 page IDs, following MediaWiki continue tokens."""
    assert 1 <= len(page_ids) <= BATCH_SIZE
    base_url = f"https://{lang}.wikipedia.org/w/api.php"
    base_params = {
        "action": "query",
        "prop": "pageimages",
        "piprop": "thumbnail|name",
        "pithumbsize": "500",
        "pilicense": "free",
        "pageids": "|".join(str(pid) for pid in page_ids),
        "format": "json",
        "formatversion": "2",
        "maxlag": "5",
    }
    responses = fetch_paginated_query(client, base_url, base_params)
    merged = merge_pageimages_responses(responses)
    return extract_pageimage_candidates(page_ids, merged)


def parse_commons_imageinfo_responses(
    requested_file_names: list[str],
    responses: list[dict[str, Any]],
) -> dict[str, CommonsMeta | None]:
    """Map requested bare file_names to CommonsMeta, or None if missing on Commons."""
    norm_map: dict[str, str] = {}
    redir_map: dict[str, str] = {}
    pages_by_title: dict[str, dict[str, Any]] = {}
    pages_by_canon: dict[str, dict[str, Any]] = {}

    for data in responses:
        query = data.get("query") or {}
        for item in query.get("normalized") or []:
            norm_map[item["from"]] = item["to"]
        for item in query.get("redirects") or []:
            redir_map[item["from"]] = item["to"]
        for page in query.get("pages") or []:
            title = page.get("title")
            if not title:
                continue
            existing = pages_by_title.get(title)
            if existing is None:
                existing = dict(page)
                if "imageinfo" in page:
                    existing["imageinfo"] = list(page["imageinfo"])
                pages_by_title[title] = existing
                pages_by_canon[title.replace(" ", "_")] = existing
            else:
                if page.get("missing"):
                    existing["missing"] = True
                if page.get("imageinfo"):
                    existing.setdefault("imageinfo", []).extend(page["imageinfo"])

    results: dict[str, CommonsMeta | None] = {}
    for name in requested_file_names:
        req_title = f"File:{name}"
        resolved = norm_map.get(req_title, req_title)
        resolved = redir_map.get(resolved, resolved)

        page = pages_by_title.get(resolved) or pages_by_canon.get(resolved.replace(" ", "_"))
        if page is None or page.get("missing"):
            results[name] = None
            continue
        imageinfo = page.get("imageinfo") or []
        if not imageinfo:
            results[name] = None
            continue
        ext = imageinfo[0].get("extmetadata") or {}
        lic = clean_metadata_text((ext.get("LicenseShortName") or {}).get("value"), MAX_LICENSE_LEN)
        lic_url = clean_license_url((ext.get("LicenseUrl") or {}).get("value"))
        artist = clean_metadata_text((ext.get("Artist") or {}).get("value"), MAX_ARTIST_LEN)
        non_free = parse_non_free((ext.get("NonFree") or {}).get("value"), lic)
        credit = clean_metadata_text((ext.get("Credit") or {}).get("value"), MAX_CREDIT_LEN)
        results[name] = CommonsMeta(
            license=lic,
            license_url=lic_url,
            artist=artist,
            credit=credit,
            non_free=non_free,
        )
    return results


def _split_commons_chunks(file_names: list[str]) -> list[list[str]]:
    """Split file_names into chunks of <=50 while keeping GET URL length safe."""
    chunks: list[list[str]] = []
    cur: list[str] = []
    cur_encoded_len = 0

    for name in file_names:
        part_len = len(urllib.parse.quote(f"File:{name}", safe=":")) + 1
        if cur and (len(cur) >= BATCH_SIZE or cur_encoded_len + part_len > MAX_GET_URL_LEN):
            chunks.append(cur)
            cur = []
            cur_encoded_len = 0
        cur.append(name)
        cur_encoded_len += part_len

    if cur:
        chunks.append(cur)
    return chunks


def fetch_commons_chunk(
    client: PoliteClient,
    chunk: list[str],
    metadata_filter: str = "LicenseShortName|LicenseUrl|Artist|Credit|NonFree",
) -> dict[str, CommonsMeta | None]:
    """Fetch Commons extmetadata for one safe-sized chunk of file names."""
    base_url = "https://commons.wikimedia.org/w/api.php"
    base_params = {
        "action": "query",
        "prop": "imageinfo",
        "iiprop": "extmetadata",
        "iiextmetadatafilter": metadata_filter,
        "titles": "|".join(f"File:{name}" for name in chunk),
        "format": "json",
        "formatversion": "2",
        "maxlag": "5",
    }
    responses = fetch_paginated_query(client, base_url, base_params)
    return parse_commons_imageinfo_responses(chunk, responses)


def fetch_commons_credits(
    client: PoliteClient,
    file_names: list[str],
    cache: dict[str, CommonsMeta | None],
) -> dict[str, CommonsMeta | None]:
    """Fetch Commons extmetadata for uncached file_names and populate cache."""
    missing_names = list(dict.fromkeys(name for name in file_names if name not in cache))

    for chunk in _split_commons_chunks(missing_names):
        parsed = fetch_commons_chunk(client, chunk)
        cache.update(parsed)

    return {name: cache[name] for name in file_names}


def connect_db(host: str, port: int, user: str, password: str, database: str):
    """Connect to MariaDB using the same driver and settings as common.py."""
    import mariadb

    con = mariadb.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        database=database,
        autocommit=False,
    )
    cur = con.cursor()
    cur.execute(f"SET mhnsw_ef_search = {EF_SEARCH}")
    cur.close()
    return con


def load_progress(path: str) -> dict[str, int]:
    """Load {lang: last_page_id_done} from disk if present."""
    if not os.path.isfile(path):
        return {}
    with open(path, "r", encoding="utf-8") as fh:
        raw = json.load(fh)
    if not isinstance(raw, dict):
        return {}
    return {str(k): int(v) for k, v in raw.items()}


def save_progress_atomic(path: str, progress: dict[str, int]) -> None:
    """Atomically persist {lang: last_page_id_done} via temp file + os.replace."""
    parent = os.path.dirname(os.path.abspath(path))
    os.makedirs(parent, exist_ok=True)
    tmp_path = f"{path}.tmp.{os.getpid()}"
    with open(tmp_path, "w", encoding="utf-8") as fh:
        json.dump(progress, fh, sort_keys=True, indent=2)
        fh.write("\n")
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp_path, path)


def load_credit_progress(path: str) -> str:
    """Load last completed file_name for --credits-only --missing-artist."""
    if not os.path.isfile(path):
        return ""
    with open(path, "r", encoding="utf-8") as fh:
        raw = json.load(fh)
    if not isinstance(raw, dict):
        return ""
    return str(raw.get("last_file_name") or "")


def save_credit_progress_atomic(path: str, last_file_name: str) -> None:
    """Atomically persist last completed file_name for --credits-only --missing-artist."""
    parent = os.path.dirname(os.path.abspath(path))
    os.makedirs(parent, exist_ok=True)
    tmp_path = f"{path}.tmp.{os.getpid()}"
    with open(tmp_path, "w", encoding="utf-8") as fh:
        json.dump({"last_file_name": last_file_name}, fh, sort_keys=True, indent=2)
        fh.write("\n")
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp_path, path)


def run_self_test() -> int:
    """Run offline assertions on embedded sample Wikipedia & Commons JSON payloads."""
    # 1. Sample PageImages payload: valid Commons image, local wiki image, no image, missing page
    sample_pageimages_1 = {
        "continue": {"picontinue": 203, "continue": "||"},
        "query": {
            "pages": [
                {
                    "pageid": 1256,
                    "ns": 0,
                    "title": "Talvisota",
                    "thumbnail": {
                        "source": (
                            "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b7/"
                            "A_Finnish_Maxim_M-32_machine_gun_nest_during_the_Winter_War.jpg/"
                            "500px-A_Finnish_Maxim_M-32_machine_gun_nest_during_the_Winter_War.jpg"
                            "?utm_source=fi.wikipedia.org&utm_campaign=api&utm_content=thumbnail"
                        ),
                        "width": 500,
                        "height": 328,
                    },
                    "pageimage": "A_Finnish_Maxim_M-32_machine_gun_nest_during_the_Winter_War.jpg",
                },
                {
                    "pageid": 327,
                    "ns": 0,
                    "title": "Hanoi Rocks",
                    "thumbnail": {
                        "source": (
                            "https://upload.wikimedia.org/wikipedia/fi/b/b7/Hanoi_logo.jpg"
                            "?utm_source=fi.wikipedia.org&utm_campaign=api&utm_content=thumbnail_unscaled"
                        ),
                        "width": 300,
                        "height": 150,
                    },
                    "pageimage": "Hanoi_logo.jpg",
                },
                {"pageid": 100, "ns": 0, "title": "Buddhalaisuus"},
            ]
        },
    }
    sample_pageimages_2 = {
        "batchcomplete": True,
        "query": {
            "pages": [
                {"pageid": 200, "missing": True},
                {
                    "pageid": 30,
                    "ns": 0,
                    "title": "Antti Satuli",
                    "thumbnail": {
                        "source": (
                            "https://upload.wikimedia.org/wikipedia/commons/9/9c/Antti_Satuli.jpg"
                            "?utm_source=fi.wikipedia.org&utm_campaign=api&utm_content=thumbnail_unscaled"
                        ),
                        "width": 200,
                        "height": 260,
                    },
                    "pageimage": "Antti_Satuli.jpg",
                },
            ]
        },
    }

    merged = merge_pageimages_responses([sample_pageimages_1, sample_pageimages_2])
    batch_res = extract_pageimage_candidates([30, 100, 200, 327, 1256], merged)
    assert len(batch_res.candidates) == 2, f"Expected 2 candidates, got {batch_res.candidates}"
    assert batch_res.no_image == 1, f"Expected no_image=1, got {batch_res.no_image}"
    assert batch_res.missing_pages == 1, f"Expected missing_pages=1, got {batch_res.missing_pages}"
    assert batch_res.non_commons_dropped == 1, (
        f"Expected local fi file dropped=1, got {batch_res.non_commons_dropped}"
    )

    c0, c1 = batch_res.candidates
    assert c0.page_id == 30 and c0.file_name == "Antti_Satuli.jpg"
    assert c0.thumb_url == "https://upload.wikimedia.org/wikipedia/commons/9/9c/Antti_Satuli.jpg"
    assert "?" not in c0.thumb_url
    assert c1.page_id == 1256
    assert c1.file_name == "A_Finnish_Maxim_M-32_machine_gun_nest_during_the_Winter_War.jpg"
    assert c1.thumb_url == (
        "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b7/"
        "A_Finnish_Maxim_M-32_machine_gun_nest_during_the_Winter_War.jpg/"
        "500px-A_Finnish_Maxim_M-32_machine_gun_nest_during_the_Winter_War.jpg"
    )
    assert "?" not in c1.thumb_url

    # 2. Sample Commons ImageInfo payload: normalized title, HTML Artist, missing file
    sample_commons = {
        "batchcomplete": True,
        "query": {
            "normalized": [
                {
                    "from": "File:A_Finnish_Maxim_M-32_machine_gun_nest_during_the_Winter_War.jpg",
                    "to": "File:A Finnish Maxim M-32 machine gun nest during the Winter War.jpg",
                },
                {
                    "from": "File:Antti_Satuli.jpg",
                    "to": "File:Antti Satuli.jpg",
                },
                {
                    "from": "File:Local_only_image.jpg",
                    "to": "File:Local only image.jpg",
                },
            ],
            "pages": [
                {
                    "pageid": 549346,
                    "ns": 6,
                    "title": "File:A Finnish Maxim M-32 machine gun nest during the Winter War.jpg",
                    "imagerepository": "local",
                    "imageinfo": [
                        {
                            "extmetadata": {
                                "Artist": {
                                    "value": (
                                        '<div class="fn value">\n'
                                        '<a href="//commons.wikimedia.org/wiki/User:Test" '
                                        'title="a > b">Unknown &amp; Co</a> &lt;SA-kuva&gt;\n'
                                        "</div>"
                                    )
                                },
                                "LicenseShortName": {"value": "Public domain"},
                                "LicenseUrl": {"value": "//creativecommons.org/publicdomain/mark/1.0/"},
                            }
                        }
                    ],
                },
                {
                    "pageid": 999999,
                    "ns": 6,
                    "title": "File:Antti Satuli.jpg",
                    "imagerepository": "local",
                    "imageinfo": [
                        {
                            "extmetadata": {
                                "Artist": {"value": "<div>   </div>"},
                                "Credit": {"value": "SA-kuva"},
                                "LicenseUrl": {"value": "javascript:alert(1)"},
                                "NonFree": {"value": "true"},
                            }
                        }
                    ],
                },
                {
                    "pageid": 888888,
                    "ns": 6,
                    "title": "File:Fair use sample.jpg",
                    "imagerepository": "local",
                    "imageinfo": [
                        {
                            "extmetadata": {
                                "LicenseShortName": {"value": "Fair use"},
                                "LicenseUrl": {"value": "https://en.wikipedia.org/wiki/Wikipedia:Non-free_content"},
                            }
                        }
                    ],
                },
                {
                    "ns": 6,
                    "title": "File:Local only image.jpg",
                    "missing": True,
                    "imagerepository": "",
                },
            ],
        },
    }

    parsed_commons = parse_commons_imageinfo_responses(
        [
            "A_Finnish_Maxim_M-32_machine_gun_nest_during_the_Winter_War.jpg",
            "Antti_Satuli.jpg",
            "Fair_use_sample.jpg",
            "Local_only_image.jpg",
        ],
        [sample_commons],
    )
    meta_maxim = parsed_commons["A_Finnish_Maxim_M-32_machine_gun_nest_during_the_Winter_War.jpg"]
    assert meta_maxim is not None
    assert meta_maxim.license == "Public domain"
    assert meta_maxim.license_url == "https://creativecommons.org/publicdomain/mark/1.0/"
    assert meta_maxim.artist == "Unknown & Co <SA-kuva>", f"Got artist={meta_maxim.artist!r}"
    assert meta_maxim.credit is None
    assert meta_maxim.non_free is False

    meta_satuli = parsed_commons["Antti_Satuli.jpg"]
    assert meta_satuli is not None
    assert meta_satuli.license is None
    assert meta_satuli.license_url is None
    assert meta_satuli.artist is None
    assert meta_satuli.credit == "SA-kuva"
    assert meta_satuli.non_free is True

    meta_fair_use = parsed_commons["Fair_use_sample.jpg"]
    assert meta_fair_use is not None
    assert meta_fair_use.license == "Fair use"
    assert meta_fair_use.license_url == "https://en.wikipedia.org/wiki/Wikipedia:Non-free_content"
    assert meta_fair_use.non_free is True

    assert parsed_commons["Local_only_image.jpg"] is None

    # 3. Truncation and utility edge cases
    long_html = "<p>" + ("A" * 600) + "</p>"
    cleaned_long = clean_metadata_text(long_html, MAX_ARTIST_LEN)
    assert cleaned_long is not None and len(cleaned_long) == 512
    cleaned_credit = clean_metadata_text("<span>" + ("C" * 260) + "</span>", MAX_CREDIT_LEN)
    assert cleaned_credit is not None and len(cleaned_credit) == 200
    assert clean_metadata_text("<div><b>SA-kuva</b> &amp; Arkisto</div>", MAX_CREDIT_LEN) == "SA-kuva & Arkisto"

    assert clean_license_url("//creativecommons.org/licenses/by/4.0/") == (
        "https://creativecommons.org/licenses/by/4.0/"
    )
    assert clean_license_url("http://creativecommons.org/licenses/by/4.0/") == (
        "http://creativecommons.org/licenses/by/4.0/"
    )
    assert clean_license_url("javascript:alert(1)") is None
    assert parse_non_free("true", None) is True
    assert parse_non_free("1", None) is True
    assert parse_non_free(True, None) is True
    assert parse_non_free("false", "Fair use") is True
    assert parse_non_free("false", "Non-free logo") is True
    assert parse_non_free("false", "CC BY-SA 4.0") is False
    assert "@" not in DEFAULT_UA and "example.invalid" not in DEFAULT_UA

    assert sanitize_thumb_url("https://evil.example.com/x.jpg") is None
    assert sanitize_thumb_url("https://thumb.wikimedia.org/wikipedia/commons/a/b.jpg?foo=1") is None
    assert parse_retry_after("17") == 17.0
    assert BACKOFF_SECONDS == (5, 10, 20, 40, 80)

    print(
        "SELF-TEST PASS: pageimages, continue, utm stripping, html artist, license_url, "
        "non_free, missing commons, truncation OK"
    )
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch Wikipedia PageImages + Commons credits into wikirag.article_image."
    )
    parser.add_argument("--lang", choices=LANGS, default=None, help="Process only one language.")
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Process only the first N articles per language (or files in --credits-only).",
    )
    parser.add_argument(
        "--restart",
        action="store_true",
        help="Ignore saved progress (or clear credit_checked_at in --credits-only mode).",
    )
    parser.add_argument(
        "--credits-only",
        action="store_true",
        help="Backfill Commons credits for article_image rows where credit_checked_at IS NULL.",
    )
    parser.add_argument(
        "--missing-artist",
        action="store_true",
        help="With --credits-only, fetch only Credit (max 200 chars) for rows where artist IS NULL OR artist = ''.",
    )
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="Run offline assertions on embedded sample JSON and exit.",
    )
    parser.add_argument("--db-host", default=os.environ.get("DB_HOST", "127.0.0.1"))
    parser.add_argument("--db-port", type=int, default=int(os.environ.get("DB_PORT", 3307)))
    parser.add_argument("--db-user", default=os.environ.get("DB_USER", "wikirag"))
    parser.add_argument("--db-password", default=os.environ.get("DB_PASSWORD", "wikirag"))
    parser.add_argument("--db-name", default=os.environ.get("DB_NAME", "wikirag"))
    parser.add_argument("--progress-file", default=DEFAULT_PROGRESS_FILE)
    parser.add_argument("--credit-progress-file", default=DEFAULT_CREDIT_PROGRESS_FILE)
    return parser.parse_args()


def run_credits_only(
    con,
    client: PoliteClient,
    *,
    restart: bool,
    limit: int | None,
) -> int:
    """Refresh Commons credit metadata for existing article_image rows without calling Wikipedia."""
    t_start = time.monotonic()
    req_start = client.request_count

    cur = con.cursor()
    try:
        if restart:
            cur.execute("UPDATE article_image SET credit_checked_at = NULL")
            con.commit()
        cur.execute(
            "SELECT DISTINCT file_name FROM article_image "
            "WHERE credit_checked_at IS NULL ORDER BY file_name"
        )
        file_names = [str(row[0]) for row in cur.fetchall()]
    finally:
        cur.close()

    if limit is not None:
        file_names = file_names[:limit]

    chunks = _split_commons_chunks(file_names)
    total_chunks = len(chunks)
    updated_cnt = 0
    missing_cnt = 0
    non_free_cnt = 0
    artist_null_credit_cnt = 0
    failed_chunks = 0

    print(
        f"[credits] starting: files={len(file_names)} chunks={total_chunks}",
        flush=True,
    )

    for chunk_idx, chunk in enumerate(chunks, start=1):
        try:
            parsed = fetch_commons_chunk(client, chunk)
            present_rows: list[tuple[str | None, str | None, str | None, str | None, int, str]] = []
            missing_rows: list[tuple[str]] = []

            for name in chunk:
                meta = parsed.get(name)
                if meta is None:
                    missing_cnt += 1
                    missing_rows.append((name,))
                    continue
                if meta.non_free:
                    non_free_cnt += 1
                    print(f"  non_free file: {name} (license={meta.license!r})", flush=True)
                if meta.artist is None and meta.credit is not None:
                    artist_null_credit_cnt += 1
                present_rows.append(
                    (
                        meta.license,
                        meta.license_url,
                        meta.artist,
                        meta.credit,
                        1 if meta.non_free else 0,
                        name,
                    )
                )

            wcur = con.cursor()
            try:
                if present_rows:
                    wcur.executemany(UPDATE_CREDITS_SQL, present_rows)
                    if wcur.rowcount > 0:
                        updated_cnt += wcur.rowcount
                if missing_rows:
                    wcur.executemany(MARK_MISSING_CREDITS_SQL, missing_rows)
                    if wcur.rowcount > 0:
                        updated_cnt += wcur.rowcount
                con.commit()
            finally:
                wcur.close()

            if chunk_idx % 20 == 0 or chunk_idx == total_chunks:
                print(
                    f"[credits] chunk {chunk_idx}/{total_chunks}: updated={updated_cnt} "
                    f"missing_on_commons={missing_cnt} non_free={non_free_cnt} "
                    f"artist_null_credit_present={artist_null_credit_cnt} "
                    f"requests={client.request_count - req_start}",
                    flush=True,
                )
        except Exception as exc:
            con.rollback()
            failed_chunks += 1
            print(
                f"FAILED CHUNK [credits] chunk {chunk_idx}/{total_chunks} "
                f"files={chunk[0]}..{chunk[-1]} (n={len(chunk)}): {exc}",
                flush=True,
            )

    elapsed_s = time.monotonic() - t_start
    total_requests = client.request_count - req_start
    print(
        f"SUMMARY credits files={len(file_names)} requests={total_requests} "
        f"updated={updated_cnt} missing_on_commons={missing_cnt} "
        f"non_free={non_free_cnt} artist_null_credit_present={artist_null_credit_cnt} "
        f"failed_chunks={failed_chunks} elapsed_s={elapsed_s:.1f}",
        flush=True,
    )
    return 1 if failed_chunks > 0 else 0


def run_missing_artist_credits(
    con,
    client: PoliteClient,
    *,
    restart: bool,
    limit: int | None,
    progress_file: str,
) -> int:
    """Resumable --credits-only mode: fetch extmetadata Credit only for rows missing artist."""
    t_start = time.monotonic()
    req_start = client.request_count

    if restart:
        save_credit_progress_atomic(progress_file, "")
    last_done = load_credit_progress(progress_file)

    cur = con.cursor()
    try:
        cur.execute(
            "SELECT DISTINCT file_name FROM article_image "
            "WHERE (artist IS NULL OR artist = '') ORDER BY file_name"
        )
        all_files = [str(row[0]) for row in cur.fetchall()]
    finally:
        cur.close()

    file_names = [f for f in all_files if f > last_done]
    if limit is not None:
        file_names = file_names[:limit]

    chunks = _split_commons_chunks(file_names)
    total_chunks = len(chunks)
    rows_updated = 0
    files_with_credit = 0
    missing_cnt = 0
    failed_chunks = 0
    had_failure = False

    print(
        f"[credits-missing-artist] starting: total_missing_artist_files={len(all_files)} "
        f"pending_files={len(file_names)} chunks={total_chunks} resume_after={last_done!r}",
        flush=True,
    )

    for chunk_idx, chunk in enumerate(chunks, start=1):
        try:
            parsed = fetch_commons_chunk(client, chunk, metadata_filter="Credit")
            update_rows: list[tuple[str | None, str]] = []
            for name in chunk:
                meta = parsed.get(name)
                if meta is None:
                    missing_cnt += 1
                    continue
                if meta.credit is not None:
                    files_with_credit += 1
                update_rows.append((meta.credit, name))

            if update_rows:
                wcur = con.cursor()
                try:
                    wcur.executemany(UPDATE_MISSING_ARTIST_CREDIT_SQL, update_rows)
                    if wcur.rowcount > 0:
                        rows_updated += wcur.rowcount
                    con.commit()
                finally:
                    wcur.close()

            if not had_failure:
                save_credit_progress_atomic(progress_file, chunk[-1])

            if chunk_idx % 20 == 0 or chunk_idx == total_chunks:
                print(
                    f"[credits-missing-artist] chunk {chunk_idx}/{total_chunks}: "
                    f"rows_updated={rows_updated} files_with_credit={files_with_credit} "
                    f"missing_on_commons={missing_cnt} requests={client.request_count - req_start}",
                    flush=True,
                )
        except Exception as exc:
            con.rollback()
            failed_chunks += 1
            had_failure = True
            print(
                f"FAILED CHUNK [credits-missing-artist] chunk {chunk_idx}/{total_chunks} "
                f"files={chunk[0]}..{chunk[-1]} (n={len(chunk)}): {exc}",
                flush=True,
            )

    elapsed_s = time.monotonic() - t_start
    total_requests = client.request_count - req_start
    print(
        f"SUMMARY credits_missing_artist files={len(file_names)} requests={total_requests} "
        f"rows_updated={rows_updated} files_with_credit={files_with_credit} "
        f"missing_on_commons={missing_cnt} failed_chunks={failed_chunks} elapsed_s={elapsed_s:.1f}",
        flush=True,
    )
    return 1 if failed_chunks > 0 else 0


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)
    args = parse_args()

    if args.self_test:
        try:
            return run_self_test()
        except AssertionError as exc:
            print(f"SELF-TEST FAIL: {exc}", file=sys.stderr)
            return 1

    if args.limit is not None and args.limit < 0:
        print("--limit must be >= 0", file=sys.stderr)
        return 2

    if args.missing_artist and not args.credits_only:
        print("--missing-artist requires --credits-only", file=sys.stderr)
        return 2

    user_agent = os.environ.get("WIKIMEDIA_UA") or DEFAULT_UA
    print(f"User-Agent: {user_agent}", flush=True)

    con = connect_db(
        host=args.db_host,
        port=args.db_port,
        user=args.db_user,
        password=args.db_password,
        database=args.db_name,
    )
    client = PoliteClient(user_agent=user_agent)

    if args.credits_only:
        try:
            if args.missing_artist:
                return run_missing_artist_credits(
                    con,
                    client,
                    restart=args.restart,
                    limit=args.limit,
                    progress_file=args.credit_progress_file,
                )
            return run_credits_only(
                con,
                client,
                restart=args.restart,
                limit=args.limit,
            )
        finally:
            con.close()

    progress = load_progress(args.progress_file)
    target_langs = (args.lang,) if args.lang else LANGS
    if args.restart:
        for lang in target_langs:
            progress.pop(lang, None)

    commons_cache: dict[str, CommonsMeta | None] = {}
    total_failed_batches = 0

    try:
        cur = con.cursor()
        try:
            cur.execute(CREATE_TABLE_SQL)
            con.commit()

            if args.lang:
                cur.execute(
                    "SELECT lang, page_id FROM article WHERE lang = ? ORDER BY lang, page_id",
                    (args.lang,),
                )
            else:
                cur.execute("SELECT lang, page_id FROM article ORDER BY lang, page_id")
            by_lang: dict[str, list[int]] = {lang: [] for lang in target_langs}
            for row_lang, row_pid in cur.fetchall():
                if row_lang in by_lang:
                    by_lang[row_lang].append(int(row_pid))
        finally:
            cur.close()

        for lang in target_langs:
            t_lang = time.monotonic()
            req_start = client.request_count

            all_ids = by_lang[lang]
            if args.limit is not None:
                all_ids = all_ids[: args.limit]
            last_done = progress.get(lang, -1)
            pending_ids = [pid for pid in all_ids if pid > last_done]
            skipped_done = len(all_ids) - len(pending_ids)

            rows_written = 0
            no_image_cnt = 0
            missing_cnt = 0
            dropped_cnt = 0
            failed_batches = 0
            lang_had_failure = False

            total_batches = (len(pending_ids) + BATCH_SIZE - 1) // BATCH_SIZE
            print(
                f"[{lang}] starting: total={len(all_ids)} skipped_done={skipped_done} "
                f"pending={len(pending_ids)} batches={total_batches} (resume_after={last_done})",
                flush=True,
            )

            for batch_idx, offset in enumerate(range(0, len(pending_ids), BATCH_SIZE), start=1):
                batch_ids = pending_ids[offset : offset + BATCH_SIZE]
                try:
                    pi_res = fetch_pageimages_batch(client, lang, batch_ids)
                    batch_rows: list[tuple[str, int, str, str, str | None, str | None, str | None, str | None, int]] = []
                    batch_dropped = pi_res.non_commons_dropped

                    if pi_res.candidates:
                        credits_by_name = fetch_commons_credits(
                            client,
                            [c.file_name for c in pi_res.candidates],
                            commons_cache,
                        )
                        for cand in pi_res.candidates:
                            meta = credits_by_name.get(cand.file_name)
                            if meta is None:
                                batch_dropped += 1
                                continue
                            batch_rows.append(
                                (
                                    lang,
                                    cand.page_id,
                                    cand.file_name,
                                    cand.thumb_url,
                                    meta.license,
                                    meta.license_url,
                                    meta.artist,
                                    meta.credit,
                                    1 if meta.non_free else 0,
                                )
                            )

                    if batch_rows:
                        wcur = con.cursor()
                        try:
                            wcur.executemany(UPSERT_SQL, batch_rows)
                            con.commit()
                        finally:
                            wcur.close()

                    rows_written += len(batch_rows)
                    no_image_cnt += pi_res.no_image
                    missing_cnt += pi_res.missing_pages
                    dropped_cnt += batch_dropped

                    # Only advance the resume watermark while no earlier batch failed in this lang,
                    # so failed batches remain below the watermark and are retried next run.
                    if not lang_had_failure:
                        progress[lang] = batch_ids[-1]
                        save_progress_atomic(args.progress_file, progress)

                    if batch_idx % 20 == 0 or batch_idx == total_batches:
                        print(
                            f"[{lang}] batch {batch_idx}/{total_batches}: rows={rows_written} "
                            f"no_image={no_image_cnt} missing={missing_cnt} dropped={dropped_cnt} "
                            f"requests={client.request_count - req_start}",
                            flush=True,
                        )
                except Exception as exc:
                    con.rollback()
                    failed_batches += 1
                    total_failed_batches += 1
                    lang_had_failure = True
                    print(
                        f"FAILED BATCH [{lang}] batch {batch_idx}/{total_batches} "
                        f"page_ids={batch_ids[0]}..{batch_ids[-1]} (n={len(batch_ids)}): {exc}",
                        flush=True,
                    )

            elapsed_lang = time.monotonic() - t_lang
            lang_requests = client.request_count - req_start
            print(
                f"SUMMARY lang={lang} articles={len(pending_ids)} total_articles={len(all_ids)} "
                f"skipped_done={skipped_done} requests={lang_requests} rows={rows_written} "
                f"no_image={no_image_cnt} missing={missing_cnt} non_commons_dropped={dropped_cnt} "
                f"failed_batches={failed_batches} elapsed_s={elapsed_lang:.1f}",
                flush=True,
            )
    finally:
        con.close()

    return 1 if total_failed_batches > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
