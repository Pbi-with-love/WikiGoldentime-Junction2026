"""Nearest articles (one item per Wikidata entity) plus per-item display metadata.

Shared by the topic road and the memory threads. Read-only; no embedding, no LLM.
CLI timing study: python -m backend.neighbours --sample 20
"""

from __future__ import annotations

import argparse
from pathlib import Path
import statistics
import sys
import time
import urllib.parse
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend import compare  # noqa: E402

LANGS = ("fi", "sv", "en")

NEAREST_SQL = """
SELECT v.lang, v.page_id, v.d, a.wikidata_id, a.title, a.url
FROM (SELECT lang, page_id, VEC_DISTANCE_COSINE(embedding, ?) AS d
      FROM article_vector ORDER BY d LIMIT ?) v
JOIN article a ON a.lang = v.lang AND a.page_id = v.page_id
ORDER BY v.d
"""

# Same expression as main.STARS_SQL event_year, applied to this article's own text.
EVENT_YEAR_EXPR = r"""CAST(NULLIF(REGEXP_SUBSTR(
    IF(LOCATE('\n', a.text) > 0, SUBSTRING(a.text, LOCATE('\n', a.text) + 1, 1000), ''),
    '\\b(1[0-9]{3}|20[0-2][0-9])\\b'), '') AS UNSIGNED)"""


def lead_text(text: str) -> str:
    """Title line + body without '##' heading lines, so a missing lead does not start with a section name."""
    first, _, rest = (text or "").partition("\n")
    return first + "\n\n" + "\n".join(ln for ln in rest.split("\n") if not ln.startswith("#")).lstrip("\n")


def group_key(wikidata_id: str | None, lang: str, page_id: int) -> str:
    return wikidata_id or f"{lang}:{page_id}"


def group_neighbours(rows: list[tuple], seed_key: str) -> list[dict]:
    """rows: (lang, page_id, d, wikidata_id, title, url) ordered by d. One group per item,
    smallest distance wins, the seed's own group is dropped."""
    seen: dict[str, dict] = {}
    for lang, page_id, d, wikidata_id, _title, _url in rows:
        key = group_key(wikidata_id, lang, int(page_id))
        if key == seed_key or key in seen:
            continue
        seen[key] = {"key": key, "wikidata_id": wikidata_id, "distance": float(d),
                     "hit_lang": lang, "hit_page_id": int(page_id)}
    return sorted(seen.values(), key=lambda g: g["distance"])


def pick_representative(siblings: dict[str, Any], prefer_lang: str | None) -> str | None:
    order = ([prefer_lang] if prefer_lang in LANGS else []) + list(LANGS)
    return next((lg for lg in order if siblings.get(lg)), None)


def war_years_from_months(rows: list[tuple]) -> list[int]:
    """rows: (month 'YYYY-MM', disputes). Years with an edit-war month (>= 3 disputes)."""
    return sorted({int(m[:4]) for m, disputes in rows if int(disputes) >= 3})


def _seed_embedding(cur, lang: str, page_id: int):
    cur.execute("SELECT embedding FROM article_vector WHERE lang = ? AND page_id = ?", (lang, page_id))
    row = cur.fetchone()
    return row[0] if row else None


def nearest_items(cur, lang: str, page_id: int, pool: int = 40) -> list[dict] | None:
    """Nearest items (not the seed's own item) by article vector; None if the seed has no vector."""
    emb = _seed_embedding(cur, lang, page_id)
    if emb is None:
        return None
    cur.execute("SELECT wikidata_id FROM article WHERE lang = ? AND page_id = ?", (lang, page_id))
    r = cur.fetchone()
    seed_key = group_key(r[0] if r else None, lang, page_id)
    cur.execute(NEAREST_SQL, (emb, pool))
    return group_neighbours(cur.fetchall(), seed_key)


def _in(n: int) -> str:
    return ",".join(["?"] * n)


def item_meta(cur, groups: list[dict], prefer_lang: str | None = None) -> list[dict]:
    """Display metadata for <= 13 groups; one query per table. Keeps the order of `groups`."""
    if not groups:
        return []
    wd_ids = [g["wikidata_id"] for g in groups if g["wikidata_id"]]
    sib: dict[str, dict] = {g["key"]: {lg: None for lg in LANGS} for g in groups}
    key_of_wd = {g["wikidata_id"]: g["key"] for g in groups if g["wikidata_id"]}
    if wd_ids:
        cur.execute(f"SELECT wikidata_id, lang, page_id, title, url FROM article "
                    f"WHERE wikidata_id IN ({_in(len(wd_ids))})", tuple(wd_ids))
        for wd, lg, pid, title, url in cur.fetchall():
            sib[key_of_wd[wd]][lg] = {"page_id": int(pid), "title": title, "url": url}
    for g in groups:  # items without a Wikidata id: the hit page only
        if not g["wikidata_id"]:
            cur.execute("SELECT title, url FROM article WHERE lang = ? AND page_id = ?",
                        (g["hit_lang"], g["hit_page_id"]))
            t, u = cur.fetchone()
            sib[g["key"]][g["hit_lang"]] = {"page_id": g["hit_page_id"], "title": t, "url": u}

    rep = {g["key"]: pick_representative(sib[g["key"]], prefer_lang) for g in groups}
    pages = [(rep[g["key"]], sib[g["key"]][rep[g["key"]]]["page_id"]) for g in groups]

    def tuples(extra_pages):
        clause = " OR ".join(["(lang = ? AND page_id = ?)"] * len(extra_pages))
        return clause, tuple(v for p in extra_pages for v in p)

    clause, params = tuples(pages)
    cur.execute(f"SELECT lang, page_id, LEFT(text, 4000), {EVENT_YEAR_EXPR} FROM article a "
                f"WHERE {clause.replace('lang', 'a.lang').replace('page_id', 'a.page_id')}", params)
    lead = {(lg, int(pid)): (txt, yr) for lg, pid, txt, yr in cur.fetchall()}
    cur.execute(f"SELECT lang, page_id, x, y, z FROM article_coord WHERE {clause}", params)
    coord = {(lg, int(pid)): (x, y, z) for lg, pid, x, y, z in cur.fetchall()}

    all_pages = [(lg, s["page_id"]) for g in groups for lg, s in sib[g["key"]].items() if s]
    clause2, params2 = tuples(all_pages)
    cur.execute(f"SELECT lang, page_id, file_name, thumb_url, license, license_url, artist, credit "
                f"FROM article_image WHERE non_free = 0 AND ({clause2})", params2)
    img = {(lg, int(pid)): row for lg, pid, *row in cur.fetchall()}

    fi_ids = [sib[g["key"]]["fi"]["page_id"] for g in groups if sib[g["key"]]["fi"]]
    stats, wars, cats = {}, {}, {}
    if fi_ids:
        cur.execute(f"SELECT page_id, first_edit, versions, reverts, disputes, war_months "
                    f"FROM wikihistory.history_stats WHERE page_id IN ({_in(len(fi_ids))})", tuple(fi_ids))
        stats = {int(r[0]): r[1:] for r in cur.fetchall()}
        cur.execute(f"SELECT page_id, month, disputes FROM wikihistory.month_stats "
                    f"WHERE disputes >= 3 AND page_id IN ({_in(len(fi_ids))})", tuple(fi_ids))
        by_page: dict[int, list] = {}
        for pid, m, d in cur.fetchall():
            by_page.setdefault(int(pid), []).append((m, d))
        wars = {pid: war_years_from_months(rs) for pid, rs in by_page.items()}
        cur.execute(f"SELECT page_id, category FROM article_category "
                    f"WHERE lang = 'fi' AND page_id IN ({_in(len(fi_ids))})", tuple(fi_ids))
        for pid, c in cur.fetchall():
            cats.setdefault(int(pid), []).append(c)

    out = []
    for g in groups:
        s = sib[g["key"]]
        lg = rep[g["key"]]
        page = s[lg]
        pk = (lg, page["page_id"])
        text, year = lead.get(pk, ("", None))
        im = next((img[(l2, s[l2]["page_id"])] for l2 in [lg, *LANGS]
                   if s[l2] and (l2, s[l2]["page_id"]) in img), None)
        image = None
        if im:
            fname, thumb, lic, lic_url, artist, credit = im
            image = {"thumb_url": thumb,
                     "file_page_url": "https://commons.wikimedia.org/wiki/File:" + urllib.parse.quote(fname),
                     "license": lic or None, "license_url": lic_url or None,
                     "artist": artist or None, "credit": credit or None}
        fi_id = s["fi"]["page_id"] if s["fi"] else None
        st = stats.get(fi_id)
        x, y, z = coord.get(pk, (None, None, None))
        out.append({
            "key": g["key"], "wikidata_id": g["wikidata_id"], "distance": g["distance"],
            "lang": lg, "page_id": page["page_id"], "title": page["title"], "url": page["url"],
            "siblings": s, "lanes": [l2 for l2 in LANGS if s[l2]],
            "event_year": int(year) if year else None,
            "summary_short": compare.format_passage(lead_text(text), 240),
            "summary_long": compare.format_passage(lead_text(text), 600),
            "thumb_url": image["thumb_url"] if image else None,
            "thumb_file": im[0] if im else None,
            "image": image,
            "has_history": st is not None,
            "first_added_year": st[0].year if st else None,
            "changes": int(st[1]) if st else None,
            "history_stats": ({"versions": int(st[1]), "reverts": int(st[2]), "disputes": int(st[3]),
                               "war_months": int(st[4])} if st else None),
            "war_years": wars.get(fi_id, []) if st else [],
            "x": x, "y": y, "z": z,
            "categories": sorted(cats.get(fi_id, [])),
        })
    return out


def _sample(cur, n: int) -> list[tuple[str, int]]:
    out = []
    for lg, k in (("fi", n * 8 // 20), ("sv", n * 6 // 20), ("en", n - n * 8 // 20 - n * 6 // 20)):
        cur.execute("SELECT lang, page_id FROM article_coord WHERE lang = ? ORDER BY CRC32(page_id) LIMIT ?",
                    (lg, k))
        out += [(a, int(b)) for a, b in cur.fetchall()]
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=20)
    args = ap.parse_args()
    from backend import rag_common
    con = rag_common.connect()
    cur = con.cursor()
    cur.execute("SET time_zone = '+00:00'")
    worst = 0.0
    print("star\tp50\tp95\tmax(ms)\td12")
    for lg, pid in _sample(cur, args.sample):
        times, gs = [], []
        for _ in range(5):
            t = time.perf_counter()
            gs = nearest_items(cur, lg, pid)[:12]
            item_meta(cur, gs, lg)
            times.append((time.perf_counter() - t) * 1000)
        warm = sorted(times[1:] or times)  # first run is cold
        p50, mx = statistics.median(warm), warm[-1]
        worst = max(worst, mx)
        print(f"{lg}:{pid}\t{p50:.0f}\t{warm[int(len(warm) * .95) - 1]:.0f}\t{mx:.0f}\t{gs[-1]['distance']:.3f}")
    print(f"overall warm max: {worst:.0f} ms")


if __name__ == "__main__":
    main()
