# Status — wikimemory

One line per spec: id | state | evidence. Keep the "Now" section current.

## Now
- Frontend: done on mock data (galaxy, search, Summarize 3D cards, Through time, Ask with history,
  memory threads, topic road with 3 fixed mock topics). Evidence: contract test 11 passed,
  `vite build` OK, Playwright E2E in Chromium with no console errors.
- Backend: FastAPI live on VPS :8002 (spec 006); core endpoints real. Dataset M stays at 50 articles for now
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
- 003-umap-coords | done | article_coord 29,460 rows (fi 19,285 / sv 4,921 / en 5,254), 0 missing (orchestrator recount); UMAP 45–84 s wall, 1.16 GB RSS, deterministic across 2 runs; :8000/:8001 200 |
- 004-mock-flags | done | `MOCK` object (11 keys) + REAL/API_BASE in contract test; npm test 11/11 (orchestrator rerun), build OK, REAL=stars vs closed port fails as expected, Playwright smoke 0 errors (`artifacts/screenshots/004-mock-flags/`) |
- 005-history-stats | done | history_stats 50 / month_stats 5,331 / global_month_stats 279 rows, edits sum 31,848 (orchestrator recount); Talvisota 2143 versions, 328 reverts, 88 disputes, 7 war months = organizers' numbers; 6 unit tests; run 1.4 s, deterministic CHECKSUM |
- 006-api-core | done | FastAPI on VPS 127.0.0.1:8002 (tmux api); orchestrator rerun: REAL=stars,search,article,timeline,asof,diff contract 10 pass/0 fail/1 skip (error-mode), mock 11/11; curl via tunnel: stars 0.32 s gz 1.7 MB, search 0.46 s, article 0.16 s, timeline 0.18 s, asof 0.18 s, diff 0.17 s; 6 MOCK flags now false; vite.config.js proxies /api to :8002; contract edits: top-2 gap <0.02, asof date 2026-10-01 |
- 007-fetch-images | done | article_image 15,355 rows (en 3,425 / fi 8,723 / sv 3,207 = 52.1% of 29,460; orchestrator recount), Commons-only, utm stripped, thumb.wikimedia.org + upload.wikimedia.org; 28 min; resume = 0 requests; /api/article/fi/1256 now returns real thumb_url. TODO: expose license/artist in API + UI credit; User-Agent contact is still a placeholder |
- 008-chunks | partial | chunk 83,797 rows (fi 51,541 / sv 11,810 / en 20,446; 19,469 reused article vectors); chunk_vector 21,497 (small batch 2,028 embedded on Mac, digest 790764642607); still to embed: fi 37,323 / sv 8,166 / en 16,811 (~1.8 chunks/s on M2 => fi ~5.8 h, all ~9.6 h), user runs scripts/EMBED_ON_MAC.md. Partial eval hit@5 76%->95%, hit@10 86%->97% is BIASED (only the answer pages got chunk vectors); the headline number needs the full run |
- 009-api-summary | done | /api/summary real (MOCK.summary=false); claude-haiku-5-5, facts carry verbatim source sentence (92/92 grounded on fi 1256/1150/440); summary_cache pre-warmed; cache hit ~3-7 ms, miss = extractive + background LLM; Talvisota: 14 sections, 5 ghost sections; contract REAL=summary 11/11, mock 11/11 (orchestrator rerun); Playwright `artifacts/screenshots/009-api-summary/` |
- 010-api-ask | done | /api/ask real (MOCK.ask=false); hero 'How did the Winter War end?' -> top fi 1256 via en/sv->fi sibling, history_available, 5 milestones (signing date drifts '13 March' -> 'evening of 12 March, in effect 13 March'); cache hit 4 ms on VPS; 25/25 pytest, contract REAL=ask 11/11; answer_cache pre-warm of data/demo-questions.tsv (40) continues in tmux answers. Follow-ups: diff rejects 4-digit rev_id (oldid=6110 -> 404, _REV_ID_RE in main.py); re-run build_answers after full chunk embed |
- 011-wayb-spike | spec ready (gate: 010 done; half a day; findings -> docs/memory/research/wayb-spike.md) |

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