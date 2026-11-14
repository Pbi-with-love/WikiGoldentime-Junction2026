# Status — wikimemory

One line per spec: id | state | evidence. Keep the "Now" section current.

## Now
- Frontend: done on mock data (galaxy, search, Summarize 3D cards, Through time, Ask with history,
  memory threads, topic road with 3 fixed mock topics). Evidence: contract test 11 passed,
  `vite build` OK, Playwright E2E in Chromium with no console errors.
- Backend: specs 002-db-merge, 003-umap-coords written. Dataset M stays at 50 articles for now
  (build/test history code on 50, rerun history-stats after the full load).
- Decisions (2026-11-14): hero demo = Ask a question, see how Wikipedia's answer changed over the
  years (Way A: current vectors find articles, answer from `FOR SYSTEM_TIME AS OF` text per year,
  precomputed + cached). "Read an article as it was" = supporting feature only.
  Way B spike only after Way A works end to end, timebox half a day, one article first:
  system-versioned `chunk_vector`, old vectors inserted with real timestamps via
  `system_versioning_insert_history = 1`; report honestly whether the vector index is used or it
  falls back to a scan (fine at ~1,000 vectors). LLM: Claude API key in VPS `~/wikimemory/.env`
  (`ANTHROPIC_API_KEY`, mode 600, never in the repo); tested OK with `claude-haiku-5-5`.
- Server data: dataset S + vectors on 3307; dataset M 50 articles / 31,848 versions on 3308.
  Not yet: DB merge, full dataset M, UMAP coordinates, images, chunks, summaries, LLM key.

## Specs
<!-- id | state | evidence -->
- kaamos-sky: 3D galaxy canvas (29,460 stars), Kaamos palette, search with "also" language dots, 2003–2026 edit-histogram time slider (`src/timeslider.js`), responsive article panel, `prefers-reduced-motion` | done | `docs/design/001-kaamos-sky.md`, `src/scene.js`, `src/ui.js`, `src/styles.css`; `artifacts/screenshots/001-kaamos-sky/` (7 PNGs); `npm run build` OK
- mock-api-and-through-time: async mock layer in `src/api.js` (`USE_MOCK = true`, `?mockError=1`, 80–300 ms latency) + Through time tab (`timeline`, `asof`, word `diff`) | done | `src/api.js`, `src/mock/index.js`, `src/mock/stars.js`, `src/mock/fixtures.js`; `npm test` (`GET /api/stars`, `/search`, `/article`, `/timeline`, `/asof`, `/diff`, error mode in 11/11 pass); Playwright Chromium `#tab-view-history` check OK
- ask-and-memory-threads: grounded AI Ask (`GET /api/ask`) with "This answer changed N times" milestones & word diff + 5-hop clickable 3D Memory Threads (`GET /api/threads` + ghost links + `--birch` constellation `#path-...`) | done | `src/ui.js`, `src/scene.js`, `src/api.js`, `src/mock/index.js`; `npm test` (`GET /api/ask` & `GET /api/threads` pass in 11/11); Playwright Chromium `#ask-panel` check OK
- three-lenses: morphable star layouts across Meaning (UMAP), History (`event_year` spiral), and Geography (Finland map) via `#lens-switcher` | done | `index.html`, `src/scene.js` (`setLens`), `src/ui.js`; `npm run build` OK
- topic-road: Talvitie winter road (`GET /api/topic-road` for Talvisota, Suomen sisällissota, Autonomian aika) with fi/sv/en ice lanes, compressed historical year markers, 3-card stack, era minimap | done | `src/api.js`, `src/mock/index.js`, `src/scene.js`, `src/ui.js`; `npm test` (`GET /api/topic-road` & `GET /api/road` pass in 11/11); Playwright Chromium check OK (`artifacts/screenshots/summary-trail/07-topic-history-preserved.png`)
- summary-trail: single-article 3D Summary Trail (`GET /api/summary/{lang}/{page_id}`), primary **Summarize** entry on all articles, overview-only on short articles, camera-relative `CSS3DRenderer` depth trail + screen-space focused overlay, "Read more" Markdown, dashed ghost sections, wheel isolation, 2-stage `Esc`; removed old article-sections road & TOC minimap | done | `src/api.js`, `src/mock/road_stations.js`, `src/scene.js`, `src/ui.js`, `index.html`, `src/styles.css`; `npm test` (11/11 pass); `npm run build` OK; Playwright Chromium E2E (`0` console/page/request errors, `artifacts/screenshots/summary-trail/` 01–07)

## Backend specs (run in this order, one worker at a time: 004/006/009/010 share src/api.js,
## contract.test.js and backend/ app)
- 002-db-merge | done | `scripts/db_merge.sh verify` EXIT 0 (rerun by orchestrator): 31,848 versions / 50 current / 50 list, fingerprint 68660370179281, SVT+INVISIBLE schema match; MariaDB 12.3.3 both; rerun merge 118 s; :8000/:8001 200. Note: vector+SVT join 1.9 s (first query, maybe cold index) — 006/010 must measure warm |
- 003-umap-coords | spec ready |
- 004-mock-flags | spec ready |
- 005-history-stats | spec ready (adds global_month_stats) |
- 006-api-core | spec ready (wires article_image -> null until 007; loads ~/wikimemory/.env) |
- 007-fetch-images | spec ready (adds license, artist columns) |
- 008-chunks | spec ready (embed on VPS overnight, tmux embed, nice) |
- 009-api-summary | spec ready |
- 010-api-ask | spec ready (hero demo, Way A) |

## Backlog (proposed specs, in order)
Phase 0 — groundwork
- per-endpoint mock flags in src/api.js | todo |
- merge wikihistory into the 3307 server + load full dataset M (overnight) | todo |
Phase 1 — real data, no LLM
- umap-coords: article_coord from Parquet vectors | todo |
- history-stats: history_stats + month_stats | todo |
- api-core: FastAPI + /api/stars, /search, /article, /timeline, /asof, /diff | todo |
- fetch-images: article_image | todo |
Phase 2 — Summarize
- api-summary: sections + LLM + summary_cache | todo |
- section-history: per-section history + ghost sections from SVT snapshots | todo |
- pre-warm demo articles (Talvisota 1256, Suomen sisällissota 1150, Jatkosota 440) | todo |
Phase 3 — Ask with history
- chunks: chunk + chunk_vector (embed on Mac) + hit@k before/after | todo |
- api-ask: chunk search + LLM + milestones + answer_cache | todo |
Phase 4 — if time allows
- api-journey: road from any article, replacing fixed topics | todo |
- search the past; dataset L for scale | todo |