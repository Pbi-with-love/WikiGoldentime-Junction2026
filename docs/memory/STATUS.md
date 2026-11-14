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
- Server data: dataset S + vectors on 3307; wikihistory (50 articles / 31,848 versions) on 3308 AND
  merged into 3307 (spec 002). Done: UMAP coords, images, chunks table, summaries, ask, LLM key.

## Now 14:50 UTC
- Dataset M LOADED 14:45–15:31 UTC into 3307 wikihistory: 19,742 articles / 862,076 versions (12 listed
  articles missing from the dumps), disk 28 GB used / 69 GB free. history_stats rerun (79 s, SELF-CHECK PASS):
  reverts 45,668, disputes 15,633, war_months 890, month_stats 371,512, global_month_stats 285; Talvisota
  unchanged (2143/328/88/7). 3307 CPU: `docker update --cpus 0` does NOT clear the cap (NanoCpus stays) ->
  set `--cpus 2` (= all cores). 3308 untouched (organizers' tm).
  Post-load DONE 15:40 UTC: deleted 4 stale summary_cache rows (fi 142/439/115530/714914, has_history false);
  rebuilt ask [32]/[34]/[39] (now history, ok=3, 37 LLM calls; their top article still != expected: retrieval
  miss, unrelated to history); re-prewarmed fi 1256 (14 sec/5 ghosts), 1150 (11/4), 440 (6/1), 0 failed calls.
  NOTE: use JSON_EXTRACT (not JSON_VALUE) for JSON booleans in MariaDB.
- (old) Dataset M load started 14:45 UTC: tmux `loadM` on VPS, organizers' load.py with our venv,
  `DB_PORT=3307 nice -n 19 ... load.py --list data/articles-all.tsv` (19,754 articles, 50 already loaded),
  log ~/wikimemory/loadM.log (START/LOAD_EXIT/END lines); 3307 capped `--cpus 1.5`, the tmux chain resets
  `--cpus 0` when done. After: history_stats, report versions/page_ids, re-prewarm demo summaries.
- 013 Hydrogen dispatched (ctx_96d2c6da714c, worktree current, alone).
- Orca: `orca repo add --kind git` returns the existing folder registration -> user must remove the
  project in the Orca UI and re-add it as git before the next parallel run.

## User decisions 16:10 UTC — multilingual is CORE (mentor asked; native sv/en articles exist)
- Rule: native first, translation second. 016 Summarize multilingual (native sibling summary by
  wikidata_id; else translate fi text only, label "Machine-translated from Finnish Wikipedia", keep
  source sentences/structure/history/ghosts; source-JSON hash, re-translate on mismatch; history only
  from fi, label "Edit history of Finnish Wikipedia"; same hash staleness for Ask (on top of 015)).
- 017 cross-language compare: per fi section best sv/en chunk by cosine (same wikidata_id), threshold
  reported; "Also in English/Swedish Wikipedia" vs "Only in Finnish Wikipedia". Hero: report what
  sv/en say about the treaty date -> docs/memory/research/hero-sv-en-treaty.md; do NOT change the demo
  story until the user has seen it.
- Order: 015 (running) -> 016 -> 017 (Argon design step for 017).

## User decisions 14:05 UTC
- 011: compare snapshots by sha1; lang='fi' for every row (dataset M is Finnish only).
- Parallel workers: re-register the project in Orca as a git repo, then `--worktree new-child` for every
  parallel worker (do it when no worker is running). Worker rule added to HYDROGEN.md/GEMINI.md: never edit docs/memory/*.
- Dataset M full load: APPROVED, tonight, last, after current workers finish: into 3307 `wikihistory` (organizers'
  load.py with DB_PORT=3307 env, their repo untouched), `nice -n 19`, tmux. Then rerun history_stats; expect
  ~862,000 versions / ~19,750 page_ids; switch backend env to 3307 and stop the 3308 container
  DECIDED: keep 3308 running (organizers' `tm` :8001 reads it); only our backend moves to 3307.
  load.py skips already-loaded articles (verified: loaded set line 35, per-file skip line 72).
  During the load: `docker update --cpus 1.5 mariadb-vector-wikipedia-rag-mariadb-1`, back to `--cpus 0` after.
  Start only after 011 and 012 finish; afterwards history_stats, report versions/page_ids, re-prewarm demo summaries.
- Orca re-registration as git repo: after 011 and 012 finish (may need the user in the Orca UI).
- /api/summary for history-less articles verified 14:15 UTC (fi 714914, sv 8184377, en 12424302, + fi 115530,
  sv 18361, en 305738): all HTTP 200, history null, ghost_sections [], llm tldr + facts with source.
  sections [] whenever words < 1500 or kept sections < 4 (spec 009 is_short rule). User 14:40 UTC: KEEP this rule.
- Priority after 012 + 011: /api/summary real sections/section history/ghosts + pre-warm demo articles
  (009 already delivered these on the 50 history articles; after the M load, rerun pre-warm), then 013.

## Update 13:45 UTC: checkpoint steps 1–3 done. Embed complete + eval (see 008); snapshot_chunk_vector = 17,791 rows (50 pages, 926 snapshots, 222 s); GPU released (ollama stopped+disabled on 65.108.33.70, gputun/embed_chain/snapshots killed) -> USER: delete the Verda instance. dl finished (16/16 files) -> dataset M load waits for the user's OK. 012 rebuilding answer_cache (tmux answers).

## CHECKPOINT 2026-11-14 ~13:00 UTC (session handoff)
Running on the VPS right now (tmux; `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes root@72.61.20.120`):
- `gputun`: SSH tunnel VPS 127.0.0.1:11435 -> Verda GPU box 65.108.33.70 (A100, root, same key)
  Ollama bge-m3 (digest 790764642607, bound 127.0.0.1, OLLAMA_NUM_PARALLEL=4).
- `embed_chain`: `embed_chunks.py --pages-from all --lang fi` then `--lang en` (sv already done),
  OLLAMA_URL=http://127.0.0.1:11435, batch 64, ~21–35 chunks/s; logs `~/wikimemory/embed_{fi,en}.log`.
  At checkpoint: chunk_vector 42,911 / 83,797. Never run two embed writers at once (vector index
  lock error "Record has changed since last read").
- `snapshots`: waits for embed_chain, then `snapshot_vectors.py` (repo `scripts/`) fills
  `wikirag.snapshot_chunk_vector` (Dec-31 snapshots where sha1 changed, 50 history articles,
  history.clean() -> chunk_article -> bge-m3) for the Way B spike; log `~/wikimemory/snapshots.log`.
- `dl`: organizers' `download.py --all` fetching the 4 missing dataset-M dumps (download only, no load).
- `api` (our FastAPI :8002), `app`/`tm`/`svt` (organizers' — never touch).
Verified this session: numeric check GPU vs organizers' vectors cos >= 0.999869 (5 untruncated
articles); write path: with index 1,437 rows/s vs no-index+index 1,609 rows/s (2,048 rows) — writes
are not the bottleneck, kept writing into live chunk_vector with index.
Next steps, in order (user's plan):
1. When embed_chain ends: verify chunk_vector == chunk (83,797), run full hit@k
   (`eval_chunks.py` on VPS, before/after), count article_vector truncated=1 per language
   (known: fi 172 / sv 22 / en 96).
2. Wait for `snapshots` to finish; report row count of snapshot_chunk_vector.
3. Release GPU: `ssh root@65.108.33.70 'systemctl stop ollama; systemctl disable ollama'`,
   `tmux kill-session -t gputun` on the VPS, then tell the user to delete the Verda instance.
   Hard deadline Sun 15 Nov 19:00 UTC.
4. Dispatch spec 012 (ask milestones fix) — rebuild answer_cache only after step 1. Then spec 013
   (i18n fi/sv/en, UI language + ?ui= for summary/ask; language only, no ARIA/keyboard):
   Argon design step first, runs after 012 (both edit backend/ask.py). docs/specs/013-i18n.md is written.
5. Dataset M full load: after `dl` finishes, ASK the user before loading (hours; 3308 is used by
   the organizers' :8001), then rerun `scripts/db_merge.sh merge` and `history_stats.py`.
Verified finding (Moscow treaty, hero question): treaty date really changed once, rev 1862876
(2006-11-07, Whiskey~fiwiki, "illalla 12. maaliskuuta"); 2004-03-26 rev 12385 (007zoo) 13->12 and
2004-07-10 rev 30486 (Hautala) back; removals 2005-11/2005-12/2008-01/2010-12 were vandalism reverted
in 1–2 min. Current /api/ask milestones attribute the change one period late and count LLM rewording
as changes -> spec 012.
Open user items: Wikimedia User-Agent contact still placeholder (use repo URL); expose image
license/artist in API+UI; Mac Ollama was uninstalled (brew also removed python@3.15, harmless).

## Specs
- 014-display-fixes | done | html.unescape in /api/asof + /api/diff (0 '&ndash;' on asof 1256 @2006), Ask strip = milestones-1 changes, 1 milestone -> 'has not changed since {year}' fi/sv/en; npm test 16/16 (orchestrator rerun), VPS pytest 25/25, 5 screenshots artifacts/screenshots/014-display-fixes/ |
- 015-ask-ui-translate-only | done | ui variant = deep copy of default + 1 batched translation call; hero en+fi identical milestones for ui /fi/sv/en (orchestrator curl, 2006 -> 1862876); 9 ui rows rebuilt (6 LLM calls, 0 fallbacks), +1 sv default row; pytest 24/24 + 9/9 VPS, npm test 16/16 mock + REAL=ask (orchestrator rerun mock), cache hit 2.4–3.0 ms. Known: same-language copy keeps milestone facts[].text in Finnish for en/sv questions -> fix in 016; summary ?ui= re-picks facts (8/14 sections of fi 1256 differ ui=en) -> 016 |
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
- 008-chunks | done | chunk = chunk_vector = 83,797 (fi 51,541 / sv 11,810 / en 20,446, VERIFIED missing=0, 1 model; Verda A100 finished 13:34 UTC); full eval 37 q: article hit@5 76% / hit@10 86% / MRR 0.65 / 16.9 ms -> chunk 92% / 95% / 0.72 / 28.0 ms (hybrid 78% / 95%, 606 ms: not worth it); one regression Ryti–Ribbentrop-sopimus; report VPS ~/wikimemory/eval_chunks_full.md; article_vector truncated fi 172 / sv 22 / en 96 |
- 009-api-summary | done | /api/summary real (MOCK.summary=false); claude-haiku-5-5, facts carry verbatim source sentence (92/92 grounded on fi 1256/1150/440); summary_cache pre-warmed; cache hit ~3-7 ms, miss = extractive + background LLM; Talvisota: 14 sections, 5 ghost sections; contract REAL=summary 11/11, mock 11/11 (orchestrator rerun); Playwright `artifacts/screenshots/009-api-summary/` |
- 010-api-ask | done | /api/ask real (MOCK.ask=false); hero 'How did the Winter War end?' -> top fi 1256 via en/sv->fi sibling, history_available, 5 milestones (signing date drifts '13 March' -> 'evening of 12 March, in effect 13 March'); cache hit 4 ms on VPS; 25/25 pytest, contract REAL=ask 11/11; answer_cache pre-warm of data/demo-questions.tsv (40) continues in tmux answers. Follow-ups: diff rejects 4-digit rev_id (oldid=6110 -> 404, _REV_ID_RE in main.py); re-run build_answers after full chunk embed |
- 012-ask-milestones | done | A2'' number-based change detection + changed_by; hero en+fi: 2003 "13 March" -> 2005 rewrite (590107) -> 2006 "evening of 12 March" changed_by 1862876 Whiskey~fiwiki -> 2009 en/2011 fi new facts (105 days / 1721 comparison); pytest 21/21 (10 A5 + A6 live), npm test 11/11 mock + 11/11 REAL=ask, SUMMARY ok=29 warn=11 errors=0 llm_calls=438 wall 620 s, answer_cache 41, cache hit 2.2 ms (orchestrator re-checked hero JSON). Limits: number-only detection (name-only changes missed); 5 history questions now 1 milestone; [38] all-unfound; 3 no-history |
- 013-i18n | done | src/i18n.js fi/sv/en + switcher, ?ui= on summary/ask (422 on bad ui), ui column in summary_cache/answer_cache; pytest 31/31 VPS, npm test 15/15 mock + REAL=summary,ask (orchestrator rerun mock 15/15 + build OK), 9 Playwright screenshots artifacts/screenshots/013-i18n/, cache hit 3.5–5.6 ms; pre-warm 6 summaries (3 demo x sv,en) + 9 answers (3 hero x fi,sv,en). Seen in screenshots: sv question "Hur slutade vinterkriget?" splits 2005–2006 / 2007–2008 (LLM picked other sentences, 1862876 not shown) -> demo with en/fi hero; "- 013-i18n | in progress (Hydrogen ctx_96d2c6da714c) — design done (docs/design/013-i18n.md, incl. optional changed_by on Ask milestone); Hydrogen waits for 012 merge; UI spec: Argon design first, Hydrogen only after 012 is done; src/i18n.js, ?ui= on summary/ask, ui column in summary_cache/answer_cache; written in parallel with 012 — check its milestone-rendering assumption against 012) |ndash;" unescaped in the AS OF text panel (pre-existing?); "changed N times" = milestones.length |
- 011-wayb-spike | done (verdict: keep Way A) | chunk_vector_hist 17,791 rows (1,341 current) built in 16.7 s, 0 embeddings (orchestrator recount); VECTOR INDEX works WITH SYSTEM VERSIONING and is used under AS OF (9.5–13 ms vs 1.27–1.58 s scan) but HNSW post-filters row_start/row_end -> overlap@10 only 5–7/10 vs exact scan at 2015 (4.3% rows live); docs/memory/research/wayb-spike.md |

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