# Spec 017: Cross-language compare — is this section also in Swedish / English Wikipedia?

Read docs/memory/ARCHITECTURE.md first (Infrastructure: SSH, Docker-only `mariadb` client, tmux,
127.0.0.1 binding, "never bulk-embed on the VPS"; Schemas; Rules: vector-search pattern,
"precompute heavy aggregates", CC BY-SA link back, mock text "[mock]"; API contract).
Also read specs 008 (chunk / chunk_vector), 009 (summary sections), 013 (i18n) and, if it exists,
016 (Summarize multilingual): this spec builds on their code, it does not rewrite it.

## Goal
For each section card of a Finnish article in Summarize, show whether the same content is also in
the Swedish and English Wikipedia article on the same topic (same `wikidata_id`), with the closest
passage and a link to it, or "Only in Finnish Wikipedia". Matching uses the bge-m3 chunk vectors
that already exist for all three languages (`chunk_vector`, 83,797 rows). No new embedding at all.

## Dependencies and sequencing
- Argon design step: may run any time (writes only `docs/design/017-cross-language-compare.md`).
- Hydrogen: starts only after spec 016 is merged into `main` (016 changes the Summarize UI in
  `src/ui.js` / `src/main.js`, `backend/summary.py` and the summary contract block) and after the
  spec-015 worker has finished deploying (both restart the `api` tmux session). Build on the merged
  code; do not revert it.
- Why a new endpoint and not a field on `/api/summary`: summary responses are cached JSON per
  `(lang, page_id, rev_id, ui)` and 016 changes that path; a separate endpoint leaves
  `backend/summary.py`, `summary_cache` and every summary cache row untouched.

## Assumptions
- Section = a kept section of `/api/summary` (spec 009 rule 2: `## ` split, drop list, < 20 words
  dropped, numbered `no` = 1..n). Compare reuses `summary.split_markdown_sections()` by import
  (read-only) and the same short-article rule (`words < 1500` or `< 4` kept sections ->
  `sections: []`), so `no`/`heading` are identical to the summary's.
- Section -> chunks: `chunk.section` stores the `## ` line stripped (`line[3:].strip()`, spec 008),
  the same string as the summary `heading`. A fi section's chunks = `chunk` rows with
  `lang='fi' AND page_id=? AND section = heading`. Two sections with the same heading share their
  chunks (accepted; comment `shortcut:` in code). Kept summary sections are a subset of chunked
  sections (009's drop list contains 008's), and articles >= 1500 words are never `reused`.
- Sibling = `wikirag.article` row with the same `wikidata_id` in `sv` / `en` (at most one per
  language; no `wikidata_id` -> no siblings). All sibling chunks count, including the intro chunk
  (`section IS NULL`) and a single `reused` chunk of a short sibling.
- Aggregation: distance(section, sibling) = MIN over all pairs (fi chunk of the section, chunk of
  the sibling) of `VEC_DISTANCE_COSINE`; the winning sibling chunk is the matched passage.
- Verdict per sibling language: `distance <= THRESHOLD` -> match, else no match. One global
  `THRESHOLD` constant, calibrated by the worker (criterion C below).
- Dataset S (`wikirag.article`) is static, so `chunk.rev_id = article.rev_id`; assert it in the
  calibration script and report any mismatch.
- fi only: the endpoint answers for `lang = fi`; the UI asks only for fi articles. sv/en sources
  are a later spec (the threshold is calibrated on fi sources only).

## Response contract (NEW endpoint)
`GET /api/compare/{lang}/{page_id}`
```json
{
  "article": {"lang": "fi", "page_id": 1256, "title": "Talvisota"},
  "threshold": 0.35,
  "siblings": {
    "sv": {"page_id": 18361, "title": "Vinterkriget", "url": "https://sv.wikipedia.org/wiki/Vinterkriget"},
    "en": {"page_id": 33924, "title": "Winter War", "url": "https://en.wikipedia.org/wiki/Winter_War"}
  },
  "sections": [
    {"no": 1, "heading": "Tausta",
     "sv": {"match": true, "distance": 0.27, "section": "Bakgrund",
            "passage": "Finland hade varit en del av ...",
            "url": "https://sv.wikipedia.org/wiki/Vinterkriget#Bakgrund"},
     "en": {"match": false, "distance": 0.44, "section": null, "passage": null, "url": null}}
  ]
}
```
(Numbers and page_ids above are illustrative.)
- `siblings.sv` / `siblings.en`: `null` when no sibling article exists; then that language key is
  `null` in every section too.
- Per section and language: `match` = `distance <= threshold`; `distance` rounded to 3 decimals and
  always present (transparency); `section`, `passage`, `url` only when `match` (else `null`).
- `section` = the sibling chunk's `section` (`null` = intro). `passage` = the sibling chunk `text`
  after the first `"\n\n"` (drops the `Title — Section` prefix), Markdown link/emphasis stripped with
  `summary.strip_markdown`, `html.unescape`d, cut at <= 240 chars on a word boundary with "…".
  Verbatim Wikipedia text, never an LLM rewrite.
- `url` = sibling `article.url` + `#` + `urllib.parse.quote(section.replace(" ", "_"))` when
  `section` is not null, else the plain sibling `url` (CC BY-SA link back).
- `sections` in the same order and with the same `no`/`heading` as `/api/summary/fi/{page_id}`;
  `[]` for short articles (same rule as the summary).
- Errors: `lang` not in fi/sv/en -> 422; `lang` sv/en -> 404 `{"detail": "Compare is available for
  Finnish articles only"}`; unknown article -> 404.

## Acceptance criteria

A. Backend (`backend/compare.py`, route in `backend/main.py`)
- [ ] `GET /api/compare/{lang}/{page_id}` follows the contract. Route registration is one function
      in `backend/main.py`; logic lives in `backend/compare.py`.
- [ ] Query pattern (no vector index; a bounded PK-range cross product of two articles' chunks):
      per sibling language, distances computed on `chunk_vector` alone, chunk text joined after:
      ```sql
      SELECT f.chunk_no, s.chunk_no, VEC_DISTANCE_COSINE(f.embedding, s.embedding) AS d
      FROM chunk_vector f
      JOIN chunk_vector s ON s.lang = ? AND s.page_id = ?
      WHERE f.lang = 'fi' AND f.page_id = ?
      ```
      then `SELECT chunk_no, section FROM chunk WHERE lang='fi' AND page_id=?` for the section map,
      and `SELECT chunk_no, section, text FROM chunk WHERE lang=? AND page_id=? AND chunk_no IN (...)`
      only for the winning sibling chunks. Prepared statements. `EXPLAIN` of the first query shows
      PK range access on both sides (report it).
- [ ] The pure part (pairs + fi chunk->section map + threshold -> per-section result; passage cut;
      anchor URL) is a function with no DB access, unit-tested.
- [ ] `backend/tests/test_compare.py` (pytest, no DB/network): MIN aggregation over several fi
      chunks of one section; `distance == threshold` is a match, `threshold + 0.001` is not;
      sibling missing -> `null` per section; section with no chunks -> both languages `null` and a
      logged warning; duplicate heading; passage drops the prefix, strips Markdown, unescapes
      `&ndash;`, cuts at a word boundary; intro match -> plain URL; anchor URL for
      "Talvisodan tausta" style headings with spaces and non-ASCII (`ä` percent-encoded).

B. Compute decision (measure, then choose; default = on request)
- [ ] Measure on the VPS, warm, the full endpoint time (`curl -w '%{time_total}'`, 5 runs, median)
      for fi 1256, 1150, 440 and the maximum over the 20 calibration articles (criterion C).
- [ ] If the maximum warm time is <= 300 ms: compute on request, no new table (expected: Talvisota
      is ~35 fi chunks x tens of sibling chunks = a few thousand 1024-d distances).
- [ ] Only if it is > 300 ms: precompute into `wikirag.section_match(lang VARCHAR(3), page_id INT
      UNSIGNED, section_no SMALLINT UNSIGNED, sib_lang VARCHAR(3), sib_page_id INT UNSIGNED,
      sib_chunk_no SMALLINT UNSIGNED, distance FLOAT, PRIMARY KEY (lang, page_id, section_no,
      sib_lang))` (pre-approved, no other schema change) built by `scripts/build_section_match.py`
      for every non-short fi article with >= 1 sibling, run on the VPS in
      `tmux new -d -s sectionmatch '...'` at `nice -n 19`; the endpoint then reads the table
      (threshold applied at read time, so recalibration needs no rebuild). Evidence: wall time,
      row counts per `sib_lang`, articles covered.

C. Threshold calibration (`scripts/calibrate_compare.py`, read-only, runs on the VPS)
- [ ] Sample: the 3 demo articles (fi 1256, 1150, 440) + 20 random fi articles that are non-short
      (summary rule) and have BOTH an sv and an en sibling, chosen deterministically
      (`ORDER BY CRC32(page_id)`, first 20 that qualify). List their page_ids and titles.
- [ ] For every (sample article, kept section, sibling language): best distance, sibling chunk
      section and the first 80 chars of the passage -> `artifacts/017-compare/calibration.tsv`.
- [ ] Unrelated baseline: the same fi sections against the sv/en sibling of a DIFFERENT sample
      article (article i vs sibling of article i+1, wrapping) -> best distances, same file, marked
      `random`.
- [ ] Hand labels in `data/compare_labels.tsv` (`page_id, no, lang, label, note`): `label = 1` when
      the sibling article contains a passage on the same content as the fi section, `0` when not.
      Labelled from the fi section text and the sibling article text (headings and body), written
      BEFORE looking at the distances. Required: every section x {sv, en} of the 3 demo articles
      plus >= 5 random articles, >= 80 rows total. For label-1 rows also record whether the
      passage the script picked is on that content (`passage_ok` column, filled after the run).
- [ ] Report `artifacts/017-compare/calibration.md`:
      1. Histogram table, 0.05-wide distance bins, counts for label 1, label 0 and `random`.
      2. Per candidate threshold 0.20 .. 0.60 step 0.025: precision, recall, F1 of "match" against
         the labels.
      3. The chosen value and why. Rule: the highest-recall threshold with precision >= 0.90
         ("Also in" claims must be right; a missed match only shows the quieter "Only in Finnish").
         If no threshold reaches 0.90, take the best-F1 value, say so plainly, and ask the
         orchestrator (`orca orchestration ask`) before wiring it in.
      4. Share of matches that land on a sibling intro chunk (`section = null`) and the
         `passage_ok` rate; note if longer sibling articles (more chunks) win more often.
- [ ] The chosen value is the `THRESHOLD` constant in `backend/compare.py` (one line with a comment
      pointing to `artifacts/017-compare/calibration.md`) and is returned as `threshold`.

D. Talvisota table (in `calibration.md` and in `worker_done`)
- [ ] For fi 1256, one row per kept section: `no | heading | sv distance | sv section + passage
      start (60 chars) | en distance | en section + passage start | verdict` where verdict is
      `sv+en`, `sv only`, `en only` or `fi only`.

E. Contract + mock (source of truth: `src/api.js` + `src/mock/contract.test.js`)
- [ ] `src/api.js`: `getCompare(lang, pageId)` -> `/api/compare/{lang}/{page_id}`; new `MOCK` key
      `compare: true`, set to `false` only after the real-mode contract test passes.
- [ ] `src/mock/index.js`: `mockGetCompare(lang, pageId)` for any fi star: `sections` with the same
      `no`/`heading` as `mockGetSummary` for that article, a mix of match / no match / `null`, every
      `passage` starting with "[mock]", `threshold` a number; sv/en -> rejects like a 404.
- [ ] New compare test block in `src/mock/contract.test.js` (other blocks untouched). Both modes:
      shape (keys above), `threshold` number, per section `sv`/`en` either `null` or an object with
      `match` boolean and `distance` number; `match === (distance <= threshold)`; match ->
      `passage` non-empty and `url` starts with `https://sv.wikipedia.org/` / `https://en.wikipedia.org/`;
      no match -> `passage === null`; `siblings.X === null` -> every section's `X === null`; fi 1256
      `sections` `no`/`heading` equal `getSummary("fi", 1256)` sections; `getCompare("sv", …)`
      rejects; unknown page rejects. Real mode only: fi 1256 has >= 1 match in each language.
- [ ] `npm test` passes in mock mode and with `REAL=compare` against the real API.

F. UI (from `docs/design/017-cross-language-compare.md`)
- [ ] `src/main.js`: when entering Summarize for a fi article, `getCompare` runs in parallel with
      `getSummary`; its result is attached to the summary items by `no` (skip a section whose
      `heading` differs). A failed or slow compare never blocks or breaks Summarize: the trail
      renders without the presence row, no console error beyond a single `console.warn`.
- [ ] Section cards (CSS3D trail cards per the design's rule for near/far cards, and the focused
      overlay) show the presence row: "Also in Swedish/English Wikipedia" per matching language with
      the passage (in an element with `lang="sv"`/`lang="en"`) and a link (`target="_blank"`,
      `rel="noopener noreferrer"`); "Only in Finnish Wikipedia" when no existing sibling matched;
      nothing when the article has no sibling at all. Overview and ghost cards show nothing.
- [ ] All new strings in `src/i18n.js` (fi/sv/en, identical keys; `src/i18n.test.js` still green).
      Load-bearing wording (Argon may refine, Hydrogen uses the design's final copy):
      en `Also in Swedish Wikipedia` / `Also in English Wikipedia` / `Only in Finnish Wikipedia`;
      fi `Myös ruotsinkielisessä Wikipediassa` / `Myös englanninkielisessä Wikipediassa` /
      `Vain suomenkielisessä Wikipediassa`; sv `Även i svenskspråkiga Wikipedia` /
      `Även i engelskspråkiga Wikipedia` / `Bara i finskspråkiga Wikipedia`.
      Passages stay in their original language (never translated).

## Scope
- May edit (Hydrogen): `backend/compare.py` (new), `backend/main.py` (one new route only),
  `backend/tests/test_compare.py` (new), `scripts/calibrate_compare.py` (new),
  `scripts/build_section_match.py` (new, only if B chooses precompute), `data/compare_labels.tsv`
  (new), `artifacts/017-compare/` (new), `src/api.js` (`getCompare` + `MOCK.compare` only),
  `src/mock/index.js` (`mockGetCompare` only), `src/mock/contract.test.js` (new compare block only),
  `src/main.js` (Summarize entry: fetch + attach only), `src/ui.js` (summary card rendering only),
  `src/styles.css` (presence row only), `src/i18n.js` (new keys only),
  `artifacts/screenshots/017-cross-language-compare/`.
- On the VPS may: copy backend files, restart only our `api` tmux session, run the calibration
  script, (only if B chooses it) create `wikirag.section_match` and run its build in tmux.
- Must not touch: `docs/memory/*`, `docs/specs/*`, `docs/design/*`, `backend/summary.py`,
  `backend/ask.py`, `backend/history.py`, `backend/rag_common.py`, `summary_cache` /
  `answer_cache` rows, `chunk` / `chunk_vector` / `article*` rows or schema, any `wikihistory`
  table, container 3308, the organizers' repos/venvs and tmux sessions `app`/`tm`, other
  endpoints' code, other contract test blocks, other `MOCK` flags.

## Boundaries
- Always: read ARCHITECTURE.md first; prepared statements; bind 127.0.0.1; run pytest, `npm test`
  (mock and `REAL=compare`) and `npm run build` before reporting; reuse `summary.split_markdown_sections`
  and `summary.strip_markdown` by import, never copy-edit them.
- Ask first (via `orca orchestration ask`): any embedding call; schema changes beyond
  `section_match`; new dependencies (none expected); response-shape changes beyond the contract
  above; a threshold below 0.90 precision; edits outside scope.
- Never: embed anything (no Ollama calls; the GPU is gone and bulk embedding on the VPS is
  forbidden); call an LLM; translate or paraphrase a passage; present mock text as Wikipedia;
  delete or weaken tests; touch the hero question report or the demo story.

## Out of scope
- sv/en source articles; section-level compare of ghost sections or the lead.
- The hero question report (separate read-only investigation) and any change to the demo story.
- Translating passages; LLM judgement of matches; recalibrating per language pair.

## Open questions (defaults chosen)
- New endpoint vs extra field on `/api/summary`? Default: new endpoint (no conflict with 016 or
  the summary cache).
- "Only in Finnish Wikipedia" is a similarity verdict, not proof of absence. Default: keep the
  user's wording; the design adds a quiet secondary hint (e.g. tooltip) saying no similar passage
  was found.
- One global threshold for sv and en? Default: yes; the report shows sv and en precision
  separately so the orchestrator can ask for two constants if they differ a lot.
- Sibling intro chunks may "win" generic sections. Default: keep them (they can genuinely cover
  the content); the report quantifies it.

## Design (UI spec)
Brief for Argon. Write the handoff to `docs/design/017-cross-language-compare.md` only (Argon edits
nothing else). Follow `docs/design/001-kaamos-sky.md` (Kaamos palette, Literata + Hanken Grotesk,
sentence case, no ALL-CAPS, no `A · B · C` metadata strings, flat panels, no shadows, no `→` on
buttons) and `docs/design/013-i18n.md` (`.mt-label`, `.fact-source-quote` left-rule quote,
`.oldid-anchor`, `.i18n-fallback-note`, language-dot rule). Read 016's design if it exists and fit
around it. Users: Finnish, Swedish and international judges comparing language editions. Decide
and specify, with exact tokens/sizes and one static HTML/CSS mock per item:
1. **Presence row placement** on section cards: on the focused overlay card (full: label + passage
   + link per language) and on CSS3D trail cards (near cards `is-next-1`/`is-next-2`: compact form,
   e.g. dots + short label only; `is-far` cards: nothing or dots only). Where it sits relative to
   the title, the `.mt-label`, one-line summary, facts, history and "Read more"; card height budget
   at 720 px viewport.
2. **Language dots:** here the dots DO mean article language (`--birch` sv, `--lichen` en,
   `--snow` fi), so they may mark which language edition has the content; say exactly how
   (dot before each "Also in …" line?) and keep them consistent with stars and the legend.
3. **Matching passage + link:** how the sv/en passage (original language, `lang` attribute) is set
   apart from the Finnish card text (reuse the 013 quote pattern?), length (<= 240 chars from the
   API), the sibling section name, and the link to the sibling article section (text of the link,
   e.g. the section name or "Read in Swedish Wikipedia"); the `distance` is not shown to readers
   (optional: tooltip "similarity" wording, or nothing).
4. **"Only in Finnish Wikipedia"** without shouting: quiet `--frost`, no `--lingon`, no alert box;
   one line; plus the honest secondary hint (no similar passage found) and where it lives.
5. **Wording in fi/sv/en** for: the two "Also in" labels, "Only in Finnish Wikipedia", the hint,
   the link text, and a loading/absent state (compare not loaded yet or failed: show nothing).
   Start from the strings in criterion F; check Finnish/Swedish grammar and length (~30% longer).
6. **Narrow widths** (< 900 px bottom-sheet / 390 px): how the row wraps on 340 px cards.

## Approach (Hydrogen)
1. Read ARCHITECTURE.md, specs 008/009/013/016, merged `backend/summary.py`, `backend/main.py`, the
   summary blocks of `src/ui.js`/`src/main.js`, and the design handoff.
2. Pure function + `test_compare.py` first (TDD), then `compare.py` DB code and the route.
3. Deploy to the VPS, run `calibrate_compare.py`, write labels, pick the threshold, measure
   timings (B), write `calibration.md` and the Talvisota table.
4. Mock + `src/api.js` + contract block; mock mode, then `REAL=compare`; flip `MOCK.compare`.
5. UI per the design; Playwright flows; `npm run build`.
The worker may split this into subtasks (backend+calibration / contract / UI) but reports once.

## Commands
- SSH: `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes root@72.61.20.120`
- Tunnel: `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes -N -L 8002:127.0.0.1:8002 root@72.61.20.120`
- Pytest (VPS): `cd ~/wikimemory && .venv/bin/pytest backend/tests/test_compare.py -q` (also the full
  `backend/tests/` once, to show nothing else broke)
- Calibration (VPS): `cd ~/wikimemory && .venv/bin/python scripts/calibrate_compare.py --out artifacts/017-compare/`
  (copy the outputs back into the repo)
- Sample (VPS): `curl -s http://127.0.0.1:8002/api/compare/fi/1256 | python3 -m json.tool`
- Timing (VPS): `for i in 1 2 3 4 5; do curl -s -o /dev/null -w '%{time_total}\n' http://127.0.0.1:8002/api/compare/fi/1256; done`
- EXPLAIN: `docker exec mariadb-vector-wikipedia-rag-mariadb-1 mariadb -uwikirag -pwikirag wikirag -e "EXPLAIN SELECT f.chunk_no, s.chunk_no, VEC_DISTANCE_COSINE(f.embedding, s.embedding) d FROM chunk_vector f JOIN chunk_vector s ON s.lang='en' AND s.page_id=33924 WHERE f.lang='fi' AND f.page_id=1256"`
  (use the real en sibling page_id of 1256)
- Contract: `npm test` (mock); `REAL=compare API_BASE=http://127.0.0.1:8002 npm test` (tunnel up)
- Build/run (local): `npm run build`; `npm run dev` with the tunnel up.
- Only if B chooses precompute: `tmux new -d -s sectionmatch 'cd ~/wikimemory && nice -n 19 .venv/bin/python scripts/build_section_match.py > sectionmatch.log 2>&1'`
  and `docker exec mariadb-vector-wikipedia-rag-mariadb-1 mariadb -uwikirag -pwikirag wikirag -e "SELECT sib_lang, COUNT(*), COUNT(DISTINCT page_id) FROM section_match GROUP BY sib_lang"`

## Playwright
`playwright-cli` against `npm run dev` + real API (tunnel). Screenshots to
`artifacts/screenshots/017-cross-language-compare/`. Check console errors and failed requests on
every flow.
1. UI fi: Summarize fi 1256 -> go to a section whose verdict is `sv+en` -> focused card shows both
   "Also in" lines with passages and links -> `01-match-fi.png`; click the en link -> a new tab
   opens `https://en.wikipedia.org/wiki/...#...` (record the URL).
2. UI fi: a Talvisota section with verdict `fi only` -> quiet "Vain suomenkielisessä Wikipediassa"
   -> `02-only-fi.png`.
3. UI sv: same article, the `sv+en` section -> Swedish labels, passages in their own language ->
   `03-match-sv.png`.
4. UI en: same -> `04-match-en.png`; the trail view (near cards with the compact row) ->
   `05-trail-en.png`.
5. Compare failure: block `/api/compare/*` in Playwright -> Summarize still opens and navigates,
   no presence row -> `06-compare-blocked.png`.
6. 390 px wide viewport, UI fi, focused `sv+en` card -> `07-narrow-fi.png`.

## Evidence required in worker_done
One consolidated report (per-subtask evidence if split):
- Files changed and `git diff --stat`.
- pytest counts (`test_compare.py` and full `backend/tests/`); `npm test` counts in mock mode and
  with `REAL=compare`; `npm run build` result; `src/i18n.test.js` included in `npm test`.
- Threshold report: the sample list, the histogram table, the precision/recall table (overall and
  sv/en separately), the chosen value and the reason, intro-chunk share, `passage_ok` rate,
  `data/compare_labels.tsv` row count.
- The Talvisota per-section table (criterion D).
- Compute decision: endpoint median-of-5 for 1256/1150/440, max over the 20 sample articles,
  `EXPLAIN` output, and the choice (on request vs table). If a table: build wall time and row
  counts per `sib_lang`.
- `curl` samples (trimmed): fi 1256 (first 2 sections), one fi article with only an en sibling,
  one fi article without `wikidata_id` or siblings, one short fi article (`sections: []`), sv 404,
  bad lang 422.
- The `src/api.js` diff (`getCompare` + `MOCK.compare` false).
- Playwright commands, screenshot paths 01–07, the en link URL, console/failed-request counts.
- Confirmation: zero embedding calls, zero LLM calls; `chunk_vector` still 83,797 rows.
- Open issues / assumptions.

## Failure semantics
Any of these means the Task failed (not a deliverable):
- A non-zero pytest, `npm test` (mock or `REAL=compare`) or `npm run build` exit.
- No calibration report, or a `THRESHOLD` not backed by the labelled table.
- Any embedding or LLM call, or any change to `chunk` / `chunk_vector` rows.
- `sections` `no`/`heading` differing from `/api/summary` for fi 1256.
- Summarize broken or blocked when `/api/compare` fails.
- Any touch to `backend/summary.py`, `summary_cache`, container 3308 or the `app`/`tm` sessions.
A precision below 0.90 is NOT a failure if it is reported honestly and raised as a `question`
before being wired in.
