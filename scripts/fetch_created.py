#!/usr/bin/env python3
"""Fill wikirag.article_created (spec 023).

fi: wikihistory.history_stats.first_edit (scripts/history_stats.py asserts it equals MIN(row_start)
    over FOR SYSTEM_TIME ALL), source 'svt'.
sv/en: first revision timestamp from each language's MediaWiki API, one page per request
    (rvdir=newer is rejected with several pageids), source 'api'. NULL created_at = page missing.
Resumable (skips rows already present), sequential, <= 5 req/s, maxlag=5. Run: nice -n 19 python3 fetch_created.py
"""
from __future__ import annotations

import json
import os
import time
import urllib.parse
import urllib.request

import mariadb

# Same contact UA as scripts/fetch_images.py.
UA = (
    "wikimemory/0.2 "
    "(https://github.com/Pbi-with-love/WikiGoldentime-Junction2026; Junction 2026 hackathon demo) "
    "python-urllib/3"
)
SLEEP_S = 0.25
requests_made = 0


def first_rev(lang, page_id):
    """Return 'YYYY-MM-DD HH:MM:SS' of the first revision, or None if the page no longer exists."""
    global requests_made
    q = urllib.parse.urlencode({
        "action": "query", "prop": "revisions", "rvprop": "timestamp", "rvdir": "newer", "rvlimit": 1,
        "pageids": page_id, "format": "json", "formatversion": 2, "maxlag": 5,
    })
    err = None
    for attempt in range(6):
        requests_made += 1
        try:
            req = urllib.request.Request(f"https://{lang}.wikipedia.org/w/api.php?{q}", headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.load(r)
            if "error" not in data:
                page = data["query"]["pages"][0]
                revs = page.get("revisions")
                return revs[0]["timestamp"].replace("T", " ").rstrip("Z") if revs else None
            err = data["error"].get("code")
        except Exception as e:  # network / 429 / 5xx: back off and retry
            err = repr(e)
        time.sleep(5 * 2**attempt)
    raise RuntimeError(f"{lang}:{page_id} failed: {err}")


def main():
    t0 = time.time()
    con = mariadb.connect(
        host=os.environ.get("DB_HOST", "127.0.0.1"), port=int(os.environ.get("DB_PORT", 3307)),
        user="wikirag", password="wikirag", database="wikirag", autocommit=True,
    )
    cur = con.cursor()
    cur.execute(
        "INSERT IGNORE INTO article_created (lang, page_id, created_at, source) "
        "SELECT 'fi', a.page_id, h.first_edit, 'svt' FROM article a "
        "JOIN wikihistory.history_stats h ON h.page_id = a.page_id WHERE a.lang = 'fi'"
    )
    print("fi rows inserted:", cur.rowcount, flush=True)
    for lang in ("sv", "en"):
        cur.execute(
            "SELECT a.page_id FROM article a LEFT JOIN article_created c "
            "ON c.lang = a.lang AND c.page_id = a.page_id WHERE a.lang = ? AND c.page_id IS NULL ORDER BY a.page_id",
            (lang,),
        )
        todo = [r[0] for r in cur.fetchall()]
        print(lang, "to fetch:", len(todo), flush=True)
        for i, pid in enumerate(todo, 1):
            cur.execute(
                "INSERT IGNORE INTO article_created (lang, page_id, created_at, source) VALUES (?, ?, ?, 'api')",
                (lang, pid, first_rev(lang, pid)),
            )
            time.sleep(SLEEP_S)
            if i % 500 == 0:
                print(lang, i, "/", len(todo), f"{time.time() - t0:.0f}s", flush=True)
    print(f"done: {requests_made} requests, {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
