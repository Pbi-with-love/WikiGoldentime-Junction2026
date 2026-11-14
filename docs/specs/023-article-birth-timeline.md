# Spec 023: Stars appear in the year their article was created (timeline from 2001)

Read docs/memory/ARCHITECTURE.md first.

## Goal (user request)
Dragging the time slider to year Y shows only articles that existed in Y: an article created in 2005 is invisible at
2003 and appears when the slider reaches 2005; dragging back hides it again. The timeline starts in **2001** (en/sv
Wikipedia started 2001, fi 2002) instead of 2003.

## Current state (verified by the orchestrator)
- src/scene.js already fades stars in by `firstEditYear` (shader ~line 85, `uYear`), but `/api/stars` only fills
  `first_edit_year` for the 19,285 fi pages with history; the ~10,175 sv/en stars default to 2003 (scene.js ~line 534).
- src/timeslider.js: MIN_YEAR 2003, MAX_YEAR 2026 (labels, major ticks 2003/2008/2014/2020/2026, aria), main.js starts at 2003.
- wikirag.article has no creation date (columns: lang, page_id, rev_id, wikidata_id, title, url, date_modified, text).

## Part A — data (can run now; disjoint from spec 022)
- [ ] Table `wikirag.article_created(lang, page_id, created_at DATETIME NULL, source ENUM('svt','api'), checked_at, PK(lang,page_id))`
      via `backend/scripts/migrate_023_article_created.sql` (approved).
- [ ] Script `scripts/fetch_created.py`: fi rows from wikihistory (MIN(row_start) per page over FOR SYSTEM_TIME ALL —
      or history_stats.first_edit if identical; say which) with source 'svt'; sv/en rows from the MediaWiki API of each
      language: `action=query&prop=revisions&rvprop=timestamp&rvdir=newer&rvlimit=1&pageids=<id>` (one page per request —
      the API forbids rvdir with multiple pages; if you find a correct batched alternative, use it and prove it on 20 pages).
      Same User-Agent constant as scripts/fetch_images.py, maxlag=5, polite pace (<= 5 req/s), resumable (skip checked),
      one process in tmux with nice -n 19 on the VPS. Report requests, runtime, coverage, year histogram per language,
      and any page whose API creation year is later than its wikirag date_modified (sanity).
**Amendment 023-A (orchestrator, after 022 merged as 5f3b204):** in the Geography lens the south of Finland (Turku,
Helsinki, Tampere band) is drawn under the bottom timeline bar/histogram (see artifacts/screenshots/022/geography-lens.png).
Part B also fixes this: frame the geography camera/positions so the whole map sits above the slider at 1280x720 and
at narrow widths (Playwright screenshots of the Geography lens at both sizes).

**Amendment 023-B (orchestrator):** `event_year` in STARS_SQL (backend/main.py) scans 1,000 chars after the first
newline and crosses into the first `## ` section (e.g. "Suomi toisessa maailmansodassa" -> 1920 from "1920- ja
1930-luvuilla"). Part B restricts it to the lead (text before the first `## `), the same rule spec 024 road.py uses, so
the History lens and the road agree. Report how many stars change event_year / become null.

## Part B — API + UI (ONLY after spec 022 is merged: same /api/stars route and scene.js)
- [ ] `/api/stars` adds `created_year` (int|null) for every star from article_created (LEFT JOIN; keep `first_edit_year`
      unchanged for history semantics). /api/stars stays < 1 s.
- [ ] scene.js: birth uses `created_year` for ALL stars (fallback: first_edit_year, then visible from MIN_YEAR).
      timeslider.js/main.js: MIN_YEAR 2001; majors e.g. 2001/2006/2011/2016/2021/2026; histogram bars for 2001–2002 may be
      empty; slider start year 2001 (reduced motion still 2026). Search/Ask results must still be clickable even if the
      star is not yet born at the current slider year (decide: auto-jump slider to its birth year, or show it faintly —
      state the choice).
- [ ] Contract test + mock: `created_year` in stars (mock: plausible years marked as mock data); npm test mock + REAL=stars.
- [ ] Playwright screenshots at 2001, 2004, 2010, 2026 on the real API (visible star counts per year printed), then
      `npm run build` + deploy dist per ARCHITECTURE.

## Scope
Part A: scripts/fetch_created.py, backend/scripts/migrate_023_article_created.sql, VPS data only.
Part B: backend/main.py (stars route), backend/test_api.py (stars test), src/scene.js, src/timeslider.js, src/main.js,
src/mock/*, src/mock/contract.test.js, src/i18n.js (only if a label is needed).
Must not touch backend/summary.py, backend/ask.py, backend/compare.py, docs/, organizers' app/tm, container 3308.
Never edit docs/memory/*. No git checkout/stash/add -A/commit.
