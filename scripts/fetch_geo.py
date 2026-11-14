#!/usr/bin/env python3
"""Fetch Wikidata coordinates (P625, else the P625 of P276 'location') into wikirag.article_geo.

Resumable (skips ids already in article_geo), sequential, polite (maxlag=5, sleep between batches).
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
API = "https://www.wikidata.org/w/api.php"
BATCH = 50
SLEEP_S = 1.0
BOX = (59.5, 70.5, 19.0, 33.5)  # lat_min, lat_max, lon_min, lon_max
requests_made = 0


def get_entities(ids):
    global requests_made
    q = urllib.parse.urlencode(
        {"action": "wbgetentities", "ids": "|".join(ids), "props": "claims", "format": "json", "maxlag": 5}
    )
    for attempt in range(6):
        requests_made += 1
        try:
            req = urllib.request.Request(f"{API}?{q}", headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.load(r)
            if "error" not in data:
                return data.get("entities", {})
            err = data["error"].get("code")
        except Exception as e:  # network / HTTP 429 / 5xx: back off and retry
            err = repr(e)
        time.sleep(5 * 2**attempt)
    raise RuntimeError(f"wbgetentities failed for {ids[:3]}...: {err}")


def claims(ent, prop):
    cl = ent.get("claims", {}).get(prop, [])
    cl = [c for c in cl if c.get("rank") != "deprecated"]
    cl.sort(key=lambda c: c.get("rank") != "preferred")  # stable: preferred first
    return cl


def coord(ent):
    for c in claims(ent, "P625"):
        v = c.get("mainsnak", {}).get("datavalue", {}).get("value")
        if v:
            return float(v["latitude"]), float(v["longitude"])
    return None


def loc_ids(ent):
    out = []
    for c in claims(ent, "P276"):
        v = c.get("mainsnak", {}).get("datavalue", {}).get("value")
        if v:
            out.append(v["id"])
    return out


def main():
    t0 = time.time()
    con = mariadb.connect(
        host=os.environ.get("DB_HOST", "127.0.0.1"), port=int(os.environ.get("DB_PORT", 3307)),
        user="wikirag", password="wikirag", database="wikirag",
    )
    cur = con.cursor()
    cur.execute(
        "SELECT DISTINCT a.wikidata_id FROM article a LEFT JOIN article_geo g ON g.wikidata_id = a.wikidata_id "
        "WHERE a.wikidata_id IS NOT NULL AND g.wikidata_id IS NULL ORDER BY 1"
    )
    todo = [r[0] for r in cur.fetchall()]
    print(f"{len(todo)} ids to fetch", flush=True)
    for i in range(0, len(todo), BATCH):
        ids = todo[i : i + BATCH]
        ents = get_entities(ids)
        res, pending = {}, {}  # id -> (lat, lon, src) ; id -> [P276 ids]
        for qid in ids:
            ent = ents.get(qid, {})
            c = coord(ent)
            if c:
                res[qid] = (c[0], c[1], "P625")
            else:
                locs = loc_ids(ent)
                if locs:
                    pending[qid] = locs
        need = sorted({l for ls in pending.values() for l in ls})
        locc = {}
        for j in range(0, len(need), BATCH):
            time.sleep(SLEEP_S)
            for lid, ent in get_entities(need[j : j + BATCH]).items():
                locc[lid] = coord(ent)
        for qid, locs in pending.items():
            c = next((locc[l] for l in locs if locc.get(l)), None)
            if c:
                res[qid] = (c[0], c[1], "P276")
        rows = [(q, *res.get(q, (None, None, None))) for q in ids]
        cur.executemany(
            "INSERT INTO article_geo (wikidata_id, lat, lon, source) VALUES (?,?,?,?) "
            "ON DUPLICATE KEY UPDATE lat=VALUES(lat), lon=VALUES(lon), source=VALUES(source), checked_at=NOW()",
            rows,
        )
        con.commit()
        print(f"{i + len(ids)}/{len(todo)}", flush=True)
        time.sleep(SLEEP_S)
    cur.execute(
        "SELECT COUNT(*), SUM(source='P625'), SUM(source='P276'), SUM(source IS NULL), "
        "SUM(lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?) FROM article_geo", BOX,
    )
    n, p625, p276, none, inbox = cur.fetchone()
    pct = lambda v: f"{100 * float(v or 0) / max(n, 1):.1f}%"
    print(f"ids={n} requests={requests_made} runtime={time.time() - t0:.0f}s "
          f"P625={p625} ({pct(p625)}) P276={p276} ({pct(p276)}) none={none} ({pct(none)}) in_box={inbox}")


if __name__ == "__main__":
    main()
