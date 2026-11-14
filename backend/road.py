"""Topic road builder: real nearest-neighbour and category roads (no embedding, no LLM)."""

from __future__ import annotations

import re
from typing import Any

from fastapi import HTTPException

from backend import neighbours, rag_common

VALID_LANGS = neighbours.LANGS
_HEADING_SPLIT_RE = re.compile(r"(?m)^##(?:\s|$)")
_YEAR_IN_LEAD_RE = re.compile(r"\b(1[0-9]{3}|20[0-2][0-9])\b")


def extract_lead_year(text: str | None) -> int | None:
    """Extract the first 4-digit year (1000-2029) from the lead only (before the first '##' heading)."""
    _, _, rest = (text or "").partition("\n")
    lead = _HEADING_SPLIT_RE.split(rest, maxsplit=1)[0]
    match = _YEAR_IN_LEAD_RE.search(lead)
    return int(match.group(1)) if match else None


def select_road_groups(
    groups: list[dict[str, Any]],
    group_cats: dict[str, set[str]],
    seed_cats: set[str],
    related_cats: set[str],
    limit: int = 12,
) -> list[dict[str, Any]]:
    """Rank candidate neighbour groups to reduce off-topic noise while preserving distance order within tiers.

    Tier 0: shares an exact Finnish category with the seed.
    Tier 1: shares a 1-hop related category (parent, child, or sibling in category_link).
    Tier 2: all remaining neighbours from the HNSW pool.
    """
    if not seed_cats:
        return list(groups[:limit])

    def _tier(group: dict[str, Any]) -> tuple[int, float, int]:
        cats = group_cats.get(group["key"], set())
        if cats & seed_cats:
            tier = 0
        elif cats & related_cats:
            tier = 1
        else:
            tier = 2
        return (tier, float(group["distance"]), 0)

    ranked = sorted(enumerate(groups), key=lambda pair: (_tier(pair[1])[0], _tier(pair[1])[1], pair[0]))
    return [g for _, g in ranked[:limit]]


def sort_road_items(items: list[dict[str, Any]], seed_key: str | None = None) -> list[dict[str, Any]]:
    """Order dated items by event_year asc (seed first on tie, then distance), undated last by distance."""
    def _sort_key(pair: tuple[int, dict[str, Any]]) -> tuple[int, int, int, float, int]:
        idx, it = pair
        yr = it.get("event_year")
        is_seed = 0 if (seed_key is not None and it.get("key") == seed_key) else 1
        dist = float(it.get("distance", 0.0))
        if yr is not None:
            return (0, int(yr), is_seed, dist, idx)
        return (1, 0, is_seed, dist, idx)

    return [it for _, it in sorted(enumerate(items), key=_sort_key)]


def build_eras(ordered_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Split dated stations into min(4, n_dated) contiguous groups by index."""
    dated = [it for it in ordered_items if it.get("event_year") is not None]
    n_dated = len(dated)
    if n_dated == 0:
        return []
    k = min(4, n_dated)
    eras: list[dict[str, Any]] = []
    for i in range(k):
        start = (i * n_dated) // k
        end = ((i + 1) * n_dated) // k
        chunk = dated[start:end]
        from_year = int(chunk[0]["event_year"])
        to_year = int(chunk[-1]["event_year"])
        label = str(from_year) if from_year == to_year else f"{from_year}–{to_year}"
        eras.append({"from_year": from_year, "to_year": to_year, "label": label})
    return eras


def build_road_events(
    ordered_items: list[dict[str, Any]],
    *,
    seed_key: str | None = None,
    seed_cats: set[str] | None = None,
    category: str | None = None,
) -> list[dict[str, Any]]:
    """Format ordered item_meta dicts into /api/topic-road event objects."""
    seed_cats_set = seed_cats or set()
    events: list[dict[str, Any]] = []
    for it in ordered_items:
        yr = it.get("event_year")
        if category is not None:
            why = {"kind": "category", "similarity": None, "category": category}
        elif seed_key is not None and it.get("key") == seed_key:
            why = {"kind": "seed", "similarity": None, "category": None}
        else:
            shared_cat = next((c for c in it.get("categories", []) if c in seed_cats_set), None)
            why = {
                "kind": "similar",
                "similarity": round(1.0 - float(it.get("distance", 0.0)), 2),
                "category": shared_cat,
            }
        events.append(
            {
                "lang": it["lang"],
                "page_id": it["page_id"],
                "wikidata_id": it["wikidata_id"],
                "title": it["title"],
                "url": it["url"],
                "x": it.get("x"),
                "y": it.get("y"),
                "z": it.get("z"),
                "event_year": yr,
                "event_label": str(yr) if yr is not None else "",
                "lanes": it["lanes"],
                "siblings": it["siblings"],
                "summary_short": it["summary_short"],
                "summary_long": it["summary_long"],
                "thumb_url": it["thumb_url"],
                "thumb_file": it["thumb_file"],
                "image": it["image"],
                "has_history": it["has_history"],
                "first_added_year": it["first_added_year"],
                "changes": it["changes"],
                "war_years": it["war_years"],
                "history_stats": it["history_stats"],
                "branches": [],
                "why": why,
            }
        )
    return events


def _in(n: int) -> str:
    return ",".join(["?"] * n)


def _apply_lead_years(cur, items: list[dict[str, Any]]) -> None:
    if not items:
        return
    pages = [(it["lang"], it["page_id"]) for it in items]
    clause = " OR ".join(["(lang = ? AND page_id = ?)"] * len(pages))
    params = tuple(v for p in pages for v in p)
    cur.execute(f"SELECT lang, page_id, LEFT(text, 4000) FROM article WHERE {clause}", params)
    leads = {(lg, int(pid)): txt for lg, pid, txt in cur.fetchall()}
    for it in items:
        it["event_year"] = extract_lead_year(leads.get((it["lang"], it["page_id"]), ""))


def _fetch_seed_and_related_cats(
    cur, lang: str, page_id: int, seed_wd: str | None
) -> tuple[set[str], set[str]]:
    seed_fi_id: int | None = None
    if lang == "fi":
        seed_fi_id = page_id
    elif seed_wd:
        cur.execute("SELECT page_id FROM article WHERE lang = 'fi' AND wikidata_id = ?", (seed_wd,))
        row = cur.fetchone()
        if row:
            seed_fi_id = int(row[0])
    if seed_fi_id is None:
        return set(), set()

    cur.execute(
        "SELECT category FROM article_category WHERE lang = 'fi' AND page_id = ?",
        (seed_fi_id,),
    )
    seed_cats = {r[0] for r in cur.fetchall()}
    if not seed_cats:
        return set(), set()

    seed_list = tuple(seed_cats)
    cur.execute(
        f"SELECT parent FROM category_link WHERE child IN ({_in(len(seed_list))})",
        seed_list,
    )
    parents = {r[0] for r in cur.fetchall()}
    parent_pool = tuple(seed_cats | parents)
    cur.execute(
        f"SELECT child FROM category_link WHERE parent IN ({_in(len(parent_pool))})",
        parent_pool,
    )
    children = {r[0] for r in cur.fetchall()}
    return seed_cats, seed_cats | parents | children


def _fetch_candidate_group_cats(cur, groups: list[dict[str, Any]]) -> dict[str, set[str]]:
    if not groups:
        return {}
    wd_ids = [g["wikidata_id"] for g in groups if g["wikidata_id"]]
    fi_by_wd: dict[str, int] = {}
    if wd_ids:
        cur.execute(
            f"SELECT wikidata_id, page_id FROM article WHERE lang = 'fi' AND wikidata_id IN ({_in(len(wd_ids))})",
            tuple(wd_ids),
        )
        fi_by_wd = {wd: int(pid) for wd, pid in cur.fetchall()}

    group_fi_pid: dict[str, int] = {}
    for g in groups:
        if g["wikidata_id"]:
            if g["wikidata_id"] in fi_by_wd:
                group_fi_pid[g["key"]] = fi_by_wd[g["wikidata_id"]]
        elif g["hit_lang"] == "fi":
            group_fi_pid[g["key"]] = int(g["hit_page_id"])

    fi_pids = sorted(set(group_fi_pid.values()))
    if not fi_pids:
        return {}
    cur.execute(
        f"SELECT page_id, category FROM article_category WHERE lang = 'fi' AND page_id IN ({_in(len(fi_pids))})",
        tuple(fi_pids),
    )
    cats_by_pid: dict[int, set[str]] = {}
    for pid, cat in cur.fetchall():
        cats_by_pid.setdefault(int(pid), set()).add(cat)
    return {key: cats_by_pid.get(pid, set()) for key, pid in group_fi_pid.items()}


def _category_road(cur, category: str) -> dict[str, Any]:
    cur.execute(
        """
        SELECT a.page_id, a.wikidata_id, COALESCE(MAX(hs.versions), -1) AS ver, MAX(CHAR_LENGTH(a.text)) AS len
        FROM article_category ac
        JOIN article a ON a.lang = 'fi' AND a.page_id = ac.page_id
        LEFT JOIN wikihistory.history_stats hs ON hs.page_id = a.page_id
        WHERE ac.lang = 'fi'
          AND (ac.category = ? OR ac.category IN (SELECT child FROM category_link WHERE parent = ?))
        GROUP BY a.page_id, a.wikidata_id
        ORDER BY ver DESC, len DESC, a.page_id ASC
        LIMIT 40
        """,
        (category, category),
    )
    rows = cur.fetchall()
    if not rows:
        raise HTTPException(status_code=404, detail=f"No articles found for category {category!r}")

    groups: list[dict[str, Any]] = []
    seen_keys: set[str] = set()
    for pid, wd, _ver, _len in rows:
        pid_int = int(pid)
        key = neighbours.group_key(wd, "fi", pid_int)
        if key in seen_keys:
            continue
        seen_keys.add(key)
        groups.append(
            {
                "key": key,
                "wikidata_id": wd,
                "distance": 0.0,
                "hit_lang": "fi",
                "hit_page_id": pid_int,
            }
        )
        if len(groups) >= 13:
            break

    items = neighbours.item_meta(cur, groups, prefer_lang="fi")
    _apply_lead_years(cur, items)
    ordered = sort_road_items(items, seed_key=None)
    return {
        "topic": {"title": category, "lang": "fi", "page_id": None, "category": category},
        "eras": build_eras(ordered),
        "events": build_road_events(ordered, category=category),
    }


def _article_road(cur, lang: str, page_id: int) -> dict[str, Any]:
    cur.execute("SELECT wikidata_id FROM article WHERE lang = ? AND page_id = ?", (lang, page_id))
    seed_row = cur.fetchone()
    if not seed_row:
        raise HTTPException(status_code=404, detail=f"Unknown article {lang}:{page_id}")
    seed_wd = seed_row[0]

    groups = neighbours.nearest_items(cur, lang, page_id, pool=40)
    if groups is None:
        raise HTTPException(status_code=404, detail=f"Missing vector for article {lang}:{page_id}")

    seed_cats, related_cats = _fetch_seed_and_related_cats(cur, lang, page_id, seed_wd)
    group_cats = _fetch_candidate_group_cats(cur, groups) if seed_cats else {}
    chosen = select_road_groups(groups, group_cats, seed_cats, related_cats, limit=12)

    seed_key = neighbours.group_key(seed_wd, lang, page_id)
    seed_group = {
        "key": seed_key,
        "wikidata_id": seed_wd,
        "distance": 0.0,
        "hit_lang": lang,
        "hit_page_id": page_id,
    }
    items = neighbours.item_meta(cur, [seed_group, *chosen], prefer_lang=lang)
    _apply_lead_years(cur, items)
    seed_item = next((it for it in items if it["key"] == seed_key), items[0])
    ordered = sort_road_items(items, seed_key=seed_key)
    return {
        "topic": {
            "title": seed_item["title"],
            "lang": seed_item["lang"],
            "page_id": seed_item["page_id"],
            "category": None,
        },
        "eras": build_eras(ordered),
        "events": build_road_events(ordered, seed_key=seed_key, seed_cats=seed_cats),
    }


def get_topic_road_response(
    lang: str | None = None,
    page_id: int | None = None,
    category: str | None = None,
) -> dict[str, Any]:
    """Handle GET /api/topic-road in article mode (lang + page_id) or category mode (category)."""
    cat_clean = (category or "").strip() or None
    if cat_clean is not None:
        if lang is not None and lang.strip() != "" and lang not in VALID_LANGS:
            raise HTTPException(status_code=422, detail=f"Unsupported lang {lang!r}")
    else:
        if lang is None or page_id is None:
            raise HTTPException(status_code=422, detail="Provide lang and page_id, or category")
        if lang not in VALID_LANGS:
            raise HTTPException(status_code=422, detail=f"Unsupported lang {lang!r}")

    con = rag_common.connect()
    try:
        cur = con.cursor()
        try:
            cur.execute("SET time_zone = '+00:00'")
            cur.execute(f"SET mhnsw_ef_search = {rag_common.EF_SEARCH}")
            if cat_clean is not None:
                return _category_road(cur, cat_clean)
            return _article_road(cur, lang, int(page_id))
        finally:
            cur.close()
    finally:
        con.close()
