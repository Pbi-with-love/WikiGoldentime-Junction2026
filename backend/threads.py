"""Memory threads for an article: nearest earlier / later / similar items (real data, no LLM)."""

from __future__ import annotations

from fastapi import HTTPException

from backend import compare, neighbours, rag_common

VALID_LANGS = neighbours.LANGS


def parse_exclude(exclude: str) -> tuple[set[int], set[tuple[str, int]]]:
    bare, pairs = set(), set()
    for tok in (exclude or "").split(","):
        tok = tok.strip()
        if tok.isdigit():
            bare.add(int(tok))
        elif ":" in tok and tok.split(":", 1)[1].isdigit():
            pairs.add((tok.split(":", 1)[0], int(tok.split(":", 1)[1])))
    return bare, pairs


def is_excluded(item: dict, bare: set[int], pairs: set[tuple[str, int]]) -> bool:
    return any(s and (s["page_id"] in bare or (lg, s["page_id"]) in pairs)
               for lg, s in item["siblings"].items())


def select_threads(items: list[dict], source_year: int | None, limit: int = 4) -> list[dict]:
    """items: candidates ascending by distance (already filtered). Returns [(type, item)] by distance."""
    chosen: list[tuple[str, dict]] = []
    used: set[str] = set()
    if source_year is not None:
        for kind, ok in (("before", lambda y: y is not None and y < source_year),
                         ("after", lambda y: y is not None and y > source_year)):
            it = next((i for i in items if i["key"] not in used and ok(i["event_year"])), None)
            if it:
                chosen.append((kind, it))
                used.add(it["key"])
    for it in items:
        if len(chosen) >= limit:
            break
        if it["key"] not in used:
            chosen.append(("semantic", it))
            used.add(it["key"])
    return sorted(chosen, key=lambda c: c[1]["distance"])


def reason(kind: str, item: dict, source_year: int | None) -> str:
    if kind == "before":
        return f"← {item['event_year']}"
    if kind == "after":
        return f"{item['event_year']} →"
    return f"≈ {round((1 - item['distance']) * 100)} %"


def build_threads(items: list[dict], source_year: int | None, bare=frozenset(), pairs=frozenset()) -> list[dict]:
    cands = [i for i in items if not is_excluded(i, bare, pairs)]
    return [{
        "type": kind,
        "target": {"lang": it["lang"], "page_id": it["page_id"], "wikidata_id": it["wikidata_id"],
                   "title": it["title"], "x": it["x"], "y": it["y"], "z": it["z"]},
        "reason": reason(kind, it, source_year),
        "summary": it["_lead200"],
        "first_year": None,
        "removed_year": None,
    } for kind, it in select_threads(cands, source_year)]


def get_threads_response(lang: str, page_id: int, exclude: str = "") -> dict:
    if lang not in VALID_LANGS:
        raise HTTPException(status_code=422, detail=f"Unsupported lang {lang!r}")
    con = rag_common.connect()
    try:
        cur = con.cursor()
        groups = neighbours.nearest_items(cur, lang, page_id)
        if groups is None:
            raise HTTPException(status_code=404, detail=f"Unknown article {lang}:{page_id}")
        items = neighbours.item_meta(cur, groups, lang)
        cur.execute(f"SELECT {neighbours.EVENT_YEAR_EXPR} FROM article a WHERE a.lang = ? AND a.page_id = ?",
                    (lang, page_id))
        row = cur.fetchone()
        source_year = int(row[0]) if row and row[0] else None
    finally:
        con.close()
    for it in items:
        it["_lead200"] = compare.format_passage(it["summary_long"], 200)
    bare, pairs = parse_exclude(exclude)
    bare.add(page_id)
    pairs.add((lang, page_id))
    return {"threads": build_threads(items, source_year, bare, pairs)}
