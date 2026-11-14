# Spec 016: Summarize in fi / sv / en: native article first, translation second

Read docs/memory/ARCHITECTURE.md first (Infrastructure: SSH flags, Docker-only `mariadb` client, tmux,
127.0.0.1 binding; Rules: LLM rules, mock text "[mock]", link back `?oldid=` / `?curid=`).
Also read specs 009 (summary), 013 (i18n: `ui`, `out_lang`, cache key, UI labels) and 015 (ask `ui`
= translation of the default answer), and `docs/design/013-i18n.md` (all UI patterns used here).

**Depends on: spec 015, merged into `main`** (`backend/ask.py`, `backend/tests/test_ask.py`,
`scripts/build_answers.py`, the ask contract test). Build on 015's merged code (`TRANSLATE_SCHEMA`,
`TRANSLATE_SYSTEM_PROMPT`, `_validate_translated_items`, `_translate_strings`, `collect_translatable`,
`apply_translations`, `question_lang`), never revert it. Must not run in parallel with any spec that
edits `backend/summary.py`, `backend/ask.py`, `src/ui.js` (Summarize), `src/api.js`,
`src/mock/index.js` or `src/mock/contract.test.js` (the orchestrator checks spec 017 for overlap).
Non-UI-design spec: **no Argon step**; Hydrogen follows `docs/design/013-i18n.md`.

## Goal
User decision 2026-11-14: fi/sv/en Summarize is a core feature. Rule: **native first, translation
second.**
- If the reader's UI language has its own Wikipedia article on the same topic (same `wikidata_id`),
  Summarize shows the summary of **that** article (its own default cache row, its own source
  sentences and links), labelled "Summary of the Swedish/English Wikipedia article".
- Otherwise it shows the requested article's default summary with **only the generated text
  translated** (one batched LLM call, like 015), labelled "Machine-translated from Finnish
  Wikipedia". Structure, facts' source sentences, history and ghost sections are copied verbatim.
- Edit history and ghost sections exist only for Finnish (dataset M). They always come from the fi
  article and are labelled "Edit history of Finnish Wikipedia" when the UI is not Finnish; with a
  native sv/en summary they are shown as a separate block after the native cards.
- A translated row (summary and ask) stores the hash of the default row it was made from. If the
  default row changes, the translated row is stale: it is served as a miss (013 fallback) and
  re-translated in the background.

Today `?ui=` re-runs the whole summary pipeline with translated prompts (`summary.py:827–828,
901–929, 934–948`), so facts differ from the default (the 015 bug, summary side). Verified by the 015
worker: fi 1256 `summary_cache` `ui=''` vs `ui='en'` differ in `facts[].source` in 8 of 14 sections.
That path is removed.

Also fixed here (015 bug, ask side): 015's same-language shortcut (its A3: `question_lang(q) == ui`
-> copy the default with 0 LLM calls) is wrong. The default's `milestones[].facts[].text` (and
possibly `milestones[].answer`) are in Finnish for en/sv questions, because they come from the
Finnish history text. So the en UI shows Finnish milestone fact texts. See B5.


**Amendment 016-A (user decisions):** (1) Index on wikirag.article.wikidata_id is APPROVED: add it without asking (CREATE INDEX IF NOT EXISTS ... in the 016 migration file; report EXPLAIN before/after). (2) fi_history must NOT depend on the Finnish summary cache: section history and ghost sections come from SVT and need no LLM. If the fi data is not available yet, build ONLY the history+ghosts part in the background (no LLM) and return a new field history_status: 'ready' | 'building' | 'none' ('none' = the fi sibling has no SVT history, or there is no fi sibling). The UI shows 'Loading edit history…' (fi/sv/en strings in src/i18n.js) for 'building' instead of an empty block, and re-fetches once when building. Add tests for the three states; contract test asserts history_status is one of the three values.

## Definitions (use these names in code, tests and logs)
- **requested article**: `(lang, page_id)` in the URL.
- **default row**: `summary_cache` row with `ui=''` (spec 009, unchanged). Same for `answer_cache`
  (`q_hash = question_hash(q)`).
- **native sibling**: `SELECT page_id FROM wikirag.article WHERE lang = ? AND wikidata_id = ?
  ORDER BY page_id LIMIT 1` with `(ui, requested.wikidata_id)`; none if `wikidata_id` is NULL.
- **fi sibling**: the same query with `lang='fi'` (the requested article itself when it is fi).
- **translated row**: `summary_cache` row with `ui = <ui>` for the requested article, built only by
  translation (below). Old 013 rows (built by the prompt-rebuild path) are deleted in step D3.
- **source_hash(json_text)**: `hashlib.sha256(json_text.encode("utf-8")).hexdigest()` of the
  default row's `json` column **exactly as stored**. One function in `backend/summary.py`, used by
  summary and ask.
- **fresh** translated row: its `source_hash` column equals `source_hash(default row json)`.
  **stale**: the default row is missing, or the column is NULL or different.
- **variant** (new response field when `ui` is set and `ui != lang`): `"native"`, `"translated"` or
  `"fallback"`.

## Decisions (made here; report disagreement as a `question`, do not change)
1. **Hash lives in a column**, `source_hash CHAR(64) NULL`, on both `summary_cache` and
   `answer_cache`, added by `backend/scripts/migrate_016_source_hash.sql`. Why a column and not the
   JSON: cache hits keep returning the stored JSON string verbatim (no parse, no extra field leaking
   to clients); the check is a string compare; default rows keep NULL, so no default row is rewritten.
   `ADD COLUMN IF NOT EXISTS` with a NULL default is metadata-only in MariaDB (existing rows are not
   touched).
   ```sql
   ALTER TABLE wikirag.summary_cache ADD COLUMN IF NOT EXISTS source_hash CHAR(64) NULL AFTER ui;
   ALTER TABLE wikirag.answer_cache  ADD COLUMN IF NOT EXISTS source_hash CHAR(64) NULL AFTER ui;
   ```
   `SUMMARY_CACHE_DDL` and `ANSWER_CACHE_DDL` gain the same column.
2. **The native switch is server-side** in `GET /api/summary/{lang}/{page_id}?ui=xx`. The client
   keeps calling `getSummary(lang, pageId, ui)` unchanged.
3. **fi history with a native summary = a separate `fi_history` block**, never merged into the
   native sections (headings differ between languages).
4. **`fi_history` is read from the fi sibling's default cache row only.** If that row does not exist
   it is `null` (no SVT queries in this path). Pre-warm guarantees it for the demo articles.
5. **Translation output budget:** a summary has up to ~120 strings (Talvisota: 14 sections), so the
   translation call uses `max_tokens=16000` (Haiku 5.5 allows up to 128K; 16000 is the safe
   non-streaming default). `summary._call_llm_json` gains a keyword `max_tokens: int = 4000`;
   every existing call keeps 4000.

## API contract

### `GET /api/summary/{lang}/{page_id}?ui=<fi|sv|en>`
`ui` absent, empty or equal to `lang`: **exactly today's behaviour, byte-identical response**, no new
fields. Invalid `ui`: 422 (unchanged). Otherwise, in this order:

**A. Native** (a native sibling `S` exists):
- Response = what `GET /api/summary/{ui}/{S}` returns today (S's default row on hit; on miss S's
  extractive payload plus ONE background job keyed `(ui, S, rev, '')`, i.e. the normal default build
  of S), parsed, with these fields set:
  `"variant": "native"`, `"out_lang": ui`,
  `"requested": {"lang", "page_id", "title", "url"}` of the requested article,
  `"fi_history"`: see below (`null` when `ui == "fi"` or no fi sibling / no fi default row / the fi
  row has no section history and no ghosts).
- `article`, `rev_id`, `tldr`, `facts`, `sections`, `ghost_sections` are S's (sv/en articles have
  `history: null` and `ghost_sections: []` per 009).
- ```json
  "fi_history": {
    "article": {"lang": "fi", "page_id": 1256, "title": "Talvisota",
                "url": "https://fi.wikipedia.org/wiki/Talvisota"},
    "rev_id": 23500447,
    "sections": [{"no": 1, "heading": "Tausta", "history": {"added_year": 2003, "changes": 14, "war_years": [2007]}}],
    "ghost_sections": [{"after_no": 5, "heading": "…", "from_year": 2007, "removed_year": 2015, "text": "…", "oldid": 9876543}]
  }
  ```
  `sections` = the fi default row's sections whose `history` is non-null (only `no`, `heading`,
  `history`); `ghost_sections` = the fi default row's `ghost_sections`, verbatim.

**B. Translated** (no native sibling, the translated row is fresh): return the stored JSON verbatim.
It is the requested article's default row deep-copied with:
- translated strings replaced: `tldr`, `facts[].label`, `facts[].value`, `sections[].one_line`,
  `sections[].summary`, `sections[].facts[].label`, `sections[].facts[].value`;
- `"out_lang": ui`, `"variant": "translated"`, `"requested": {lang, page_id, title, url}` (= the
  article itself).
Everything else is identical to the default row: `article`, `mode`, `rev_id`, every `source`, every
section's `no`, `heading`, `words`, `reading_minutes`, `text`, `history`, all `ghost_sections`, list
lengths and order.

**C. Fallback** (no native sibling, translated row missing or stale): 013's miss behaviour (default
row if it exists, else the extractive payload; text in the article's language, `out_lang = lang`)
plus `"variant": "fallback"` and `"requested"`; schedule ONE background translation job keyed
`(lang, page_id, rev, ui)`. Never await an LLM call.

### `GET /api/ask?q=…&ui=…`
Response shape unchanged. Only staleness is added (section "Ask on top of 015").

### Mock layer (`src/mock/index.js`, `mockGetSummary` only)
- `ui` absent or `ui == star.lang`: unchanged.
- Sibling with `lang === ui` in `byWikidata`: return `buildSummaryForStar(sibling, …)` with
  `variant: "native"`, `out_lang: ui`, `requested` = the requested star, and `fi_history` built from
  `buildSummaryForStar(fi star)` (sections with history + its ghosts) when the requested or a sibling
  star is fi and `ui !== "fi"`, else `null`.
- Otherwise: today's `[mock] (<ui>)` translated output plus `variant: "translated"` and `requested`.
- Mock text stays marked "[mock]".

## Acceptance criteria

### A. Backend summary (`backend/summary.py`)
- [ ] **A1. Native switch** in `get_summary_response` as in contract A. Lookups are prepared
      statements. No LLM call, no SVT query in the request path.
- [ ] **A2. Translation build.** `build_and_cache_llm_summary(lang, page_id, ui=xx, force)` with
      `xx != lang`:
      1. If not `force` and the translated row is fresh: return it (cache hit).
      2. Get the default payload with `build_and_cache_llm_summary(lang, page_id, ui=None,
         force=False)` (cache hit, or the normal default build). Never force or change a default row.
      3. Read the default row's stored `json` text and compute `source_hash` from it.
      4. Collect the translatable strings (contract B list), deduplicate by exact text, send them in
         ONE call through the shared translator (A3). `source`, `heading`, `text`, ghosts and history
         are never sent.
      5. Apply the mapping to a deep copy, set `out_lang`, `variant`, `requested`, write the row with
         `ui = xx` and `source_hash` (new `CACHE_PUT_SQL` column; default writes pass NULL).
      6. If every string fell back or the call returned `None`: write nothing, log at error level,
         return `(default_payload, stats, False)` with `stats.failed_calls == 1`. Some fell back:
         write the row, log the count.
      It does no section split, no SVT query and no per-section LLM call of its own.
      One log line per build:
      `summary translated fi:<page_id> ui=<ui> strings=<n> unique=<m> calls=1 fallbacks=<k> tok=<in>+<out> <s>s`.
- [ ] **A3. One shared translator.** Move 015's `TRANSLATE_SCHEMA`, `TRANSLATE_SYSTEM_PROMPT` and the
      per-string validation (`_validate_translated_items`) into `backend/summary.py` as
      `translate_strings(client, model, strings, ui) -> (mapping, fallbacks, in_tok, out_tok, ok)`
      calling `_call_llm_json(..., max_tokens=16000)`. `backend/ask.py` keeps its names as aliases
      (`TRANSLATE_SCHEMA = summary.TRANSLATE_SCHEMA`, etc.) and its `_translate_strings` wraps the
      shared function, keeping its stats/`RuntimeError` behaviour, so every 015 test passes
      unchanged. Prompt text unchanged (character-for-character 015's). Model: `SUMMARY_MODEL` env,
      default `claude-haiku-5-5`.
- [ ] **A4. Request-path staleness.** The ui-row read is one query that also returns the default
      row:
      `SELECT u.json, u.source_hash, d.json FROM wikirag.summary_cache u LEFT JOIN wikirag.summary_cache d
       ON d.lang=u.lang AND d.page_id=u.page_id AND d.rev_id=u.rev_id AND d.ui='' WHERE u.lang=? AND
       u.page_id=? AND u.rev_id=? AND u.ui=?`.
      Fresh: return `u.json` verbatim. Stale: contract C (fallback + one job). The background job
      calls `build_and_cache_llm_summary(..., ui=xx, force=True)`; `force` applies to the ui row only.
- [ ] **A5. Dead code removed:** `_NATIVE_REMINDER`, `_build_translated_system_prompt`,
      `TRANSLATED_SYSTEM_PROMPTS`, the `ui` parameter of `build_summary_payload` and its branches
      (`cache_ui` / `active_system_prompt`, lines ~827–828, ~901–913, ~934–947, ~997–1000:
      `out_lang` is always `lang` for a default build). `SYSTEM_PROMPT` and default prompts/messages
      stay character-for-character. Verify:
      `grep -n "TRANSLATED_SYSTEM\|_NATIVE_REMINDER\|active_system_prompt" backend/summary.py` -> empty.
- [ ] **A6. Defaults untouched:** `ui` absent / equal to `lang` produces the same bytes as before
      (test with a fixed fake DB: response body equal to the pre-change body).

### B. Ask on top of 015 (`backend/ask.py`, ui path only)
- [ ] **B1.** `CACHE_PUT_SQL` gains `source_hash`; default rows write NULL; ui rows write
      `summary.source_hash(<default row json text as stored>)`. In 015's ui build, the default JSON
      text is read from `answer_cache` after step A1.2 (or taken from the serialized string the
      default build just wrote; it must be byte-identical to the stored column).
- [ ] **B2.** `build_and_cache_ask(q, force=False, ui=xx)`: a cached ui row counts as a hit only if
      fresh; a stale row is rebuilt by translation (015's path, 0 or 1 call) and rewritten with the
      new hash.
- [ ] **B3.** `get_ask_response` with `ui`: one query returns the ui row's `json`, `source_hash` and
      the default row's `json` (`CACHE_GET_SQL` stays for other callers). Fresh: served verbatim.
      Stale: exactly 015/013's ui-miss response (default row with `out_lang: null`) plus ONE
      background `build_and_cache_ask(force=True, ui=ui)`. No LLM call in the handler.
- [ ] **B5. Same-language shortcut removed (015 A3 bug).** Rule: **every ui variant makes exactly
      one batched translation call** over all its unique translatable strings, whatever
      `question_lang(q)` says. The only 0-call case is an empty string list. Reason: nothing in this
      codebase can verify that a string is already in the ui language (`question_lang` guesses the
      language of the question, not of the milestone texts), and 015's `TRANSLATE_SYSTEM_PROMPT`
      already returns text that is already in the target language unchanged. `question_lang` stays
      and is used only in the `ask translated` log line. `build_answers.py` SUMMARY `llm_calls` then
      counts 1 per translated ui variant (check it; edit the script only if it does not).
- [ ] **B4.** Nothing else in `ask.py` changes; the default build, prompts and milestones are
      byte-identical.

### C. Tests (pytest, no network, LLM faked; extend the existing fakes)
- [ ] **C1 summary native:** fi article with a seeded sv sibling whose default row is cached ->
      `ui=sv` returns the sibling's row + `variant "native"`, `out_lang "sv"`, `requested.page_id ==
      1256`, `fi_history` built from the fi default row (only sections with history, ghosts equal),
      0 LLM calls, 0 jobs. Sibling row missing -> sibling extractive + exactly one job
      `(sv, S, rev, '')`. `ui=fi` on an sv article with fi sibling -> native fi, `fi_history null`.
- [ ] **C2 summary translated build:** fake default with ≥ 4 sections, facts, history and 2 ghosts, a
      string repeated twice. Assert: (a) deep equality after deleting the translated keys and
      `out_lang`/`variant`/`requested` from both; (b) no `source`/`heading`/`text`/ghost text in the
      LLM request; (c) exactly 1 call, repeated string sent once, `max_tokens == 16000`; (d) an empty
      translation for one id falls back for that string only; (e) `None` -> no write,
      `failed_calls == 1`; (f) written `source_hash == source_hash(stored default json)`; (g) a
      `force=True` ui build leaves the default row unchanged.
- [ ] **C3 summary staleness:** fresh row -> verbatim, 0 jobs; `source_hash` changed or NULL ->
      `variant "fallback"`, `out_lang == lang`, exactly one job `(lang, page_id, rev, ui)`; after the
      job runs (fake LLM) the next GET is fresh and `variant "translated"`.
- [ ] **C4 ask staleness:** ui row fresh -> verbatim, 0 calls; ui row with a wrong hash ->
      `get_ask_response` returns the default with `out_lang: null` and schedules 1 job;
      `build_and_cache_ask(ui=…)` without force rebuilds it with 1 call and writes the new hash;
      default rows have `source_hash` NULL.
- [ ] **C4b same-language bug:** fake default answer for the en question "How did the Winter War
      end?" whose `answer`/`facts[].text` are English and whose milestones have Finnish `answer` and
      `facts[].text`. Building `ui="en"` makes exactly 1 LLM call; the request contains the Finnish
      milestone texts; the variant's milestone fact texts are the fake translations; `source_sentence`
      values are unchanged and never sent. Update 015's test (g) (A3 = 0 calls) to the B5 rule: it
      now expects 1 call; `question_lang` assertions for the three hero questions stay.
- [ ] **C5** Rewrite 013's summary test part 5 (`test_summary.py` ~703–742, asserts the removed
      `TRANSLATED_SYSTEM_PROMPTS`) to the translation path: seed the default row, build `ui="sv"`,
      keep the assertions on `out_lang`, the verbatim Finnish `source`, and that the `''` row is not
      changed. Every other existing test (summary and ask, incl. all of 015's) passes unchanged.

### D. Frontend
- [ ] **D1 `src/api.js`:** no signature change expected. Touch it only if needed; `MOCK` values
      unchanged.
- [ ] **D2 `src/mock/index.js`:** `mockGetSummary` per "Mock layer" above. Nothing else.
- [ ] **D3 contract test (`src/mock/contract.test.js`, summary test block + ask test block only),
      mock and real mode:**
      - Replace 013's assertion 5 (Talvisota `ui=sv` = translated) with: for `ui` in `sv`, `en`:
        `variant === "native"`, `article.lang === ui`, `article.page_id !== 1256`,
        `requested.page_id === 1256`, `out_lang === ui`; real mode: every top-level fact `source` is
        a substring of `/api/article/{ui}/{article.page_id}` text (sources in sv/en), `mode === "llm"`,
        and `fi_history` has `article.page_id === 1256`, `ghost_sections.length >= 1`.
      - Translated: article `T` (chosen in step D4; must exist in the mock stars too, else ask) with
        `ui="sv"`: `variant === "translated"`, `out_lang === "sv"`, `article.lang === "fi"`, and
        compared with the default `getSummary("fi", T)`: same `rev_id`, section count, every section's
        `no`/`heading`/`text`/`history`, same `ghost_sections` (deep equal), same fact `source`s in
        order.
      - Ask (real mode only, after 015's assertions): unchanged shape; no new assertion needed beyond
        015's.
      - Existing assertions otherwise untouched.
- [ ] **D4 `src/i18n.js`** new keys, identical in all three tables (the i18n test enforces the key
      set):
      | key | en | sv | fi |
      |---|---|---|---|
      | `summary.nativeLabel` | Summary of the English Wikipedia article | Sammanfattning av artikeln i svenskspråkiga Wikipedia | Tiivistelmä suomenkielisen Wikipedian artikkelista |
      | `summary.mtFromWiki.fi` | Machine-translated from Finnish Wikipedia | Maskinöversatt från finskspråkiga Wikipedia | Konekäännös suomenkielisestä Wikipediasta |
      | `summary.mtFromWiki.sv` | Machine-translated from Swedish Wikipedia | Maskinöversatt från svenskspråkiga Wikipedia | Konekäännös ruotsinkielisestä Wikipediasta |
      | `summary.mtFromWiki.en` | Machine-translated from English Wikipedia | Maskinöversatt från engelskspråkiga Wikipedia | Konekäännös englanninkielisestä Wikipediasta |
      | `summary.fiHistoryLabel` | Edit history of Finnish Wikipedia | Redigeringshistorik från finskspråkiga Wikipedia | Suomenkielisen Wikipedian muokkaushistoria |
      (`summary.nativeLabel` is one string per UI language: a native article's language always
      equals the UI language.) Add a test in `src/i18n.test.js` that the three tables contain these
      five keys.
- [ ] **D5 `src/ui.js`, Summarize only** (patterns and classes from `docs/design/013-i18n.md`; no new
      CSS unless a class is missing, then only in `src/styles.css` reusing existing tokens):
      - `variant === "native"`: the overview card shows `t("summary.nativeLabel")` in a `.mt-label`
        element at the 013 label position; no machine-translated label; facts render as for an
        untranslated summary.
      - `variant === "translated"`: the existing machine-translated label text becomes
        `t("summary.mtFromWiki." + article.lang)`; facts keep 013's translated pattern (claim +
        verbatim `source` with `lang` attribute + `?oldid=` link).
      - `variant === "fallback"` or missing: 013 behaviour unchanged (fallback note).
      - `fi_history` non-null: `buildSummaryItems` appends, after all native items, one item
        `kind: "fiHistory"` and then one `kind: "ghost"` item per `fi_history.ghost_sections` (flag
        `fromFi: true`). The `fiHistory` card shows `.mt-label` `t("summary.fiHistoryLabel")`, the fi
        title as a link to `fi_history.article.url`, and one row per section: heading (verbatim
        Finnish, `lang="fi"`) + the existing `summary.rewrittenTimes` text and war dot. Far cards and
        the progress text handle the new kind (title only / no "section N of M" for it).
        `src/scene.js` needs no change (it only distinguishes `ghost`); verify.
      - Ghost cards show `.mt-label` `t("summary.fiHistoryLabel")` when `uiLang !== "fi"` (native
        `fromFi` ghosts and translated-row ghosts alike). No label in the fi UI.
      - No other UI change; Ask panel untouched.

### E. VPS (approved by the orchestrator for exactly these steps)
- [ ] **E1** Deploy backend files; run the migration once; `SHOW CREATE TABLE` both tables; row
      counts by `ui` before/after equal; restart only the `api` tmux; pytest on the VPS.
- [ ] **E2** Snapshot defaults before any write:
      `SELECT lang,page_id,rev_id,CRC32(json) FROM wikirag.summary_cache WHERE ui='' ORDER BY 1,2,3`
      -> `~/wikimemory/sc_default_before.tsv`; `SELECT q_hash,CRC32(json) FROM wikirag.answer_cache
      WHERE ui='' ORDER BY 1` -> `~/wikimemory/ac_default_before16.tsv`.
- [ ] **E3** Choose `T`: a long fi article with history and no sv sibling (also report whether it
      has an en sibling):
      `SELECT a.page_id, a.title, LENGTH(a.text) FROM wikirag.article a JOIN wikihistory.history_stats h
       ON h.page_id=a.page_id WHERE a.lang='fi' AND NOT EXISTS (SELECT 1 FROM wikirag.article s WHERE
       s.lang='sv' AND s.wikidata_id=a.wikidata_id) AND LENGTH(a.text) > 20000 ORDER BY h.versions DESC LIMIT 5`.
      Pick the first that has ≥ 4 kept sections and ≥ 1 ghost after its default build and exists in
      the mock stars. Report the 5 candidates and the choice.
- [ ] **E4** Report sv/en siblings of fi 1256, 1150, 440 (`lang, page_id, title`) and whether
      `wikirag.article` has an index on `wikidata_id` (`SHOW INDEX`) plus the measured sibling-lookup
      time. Adding an index = ask first.
- [ ] **E5** `DELETE FROM wikirag.summary_cache WHERE ui <> ''` (013's prompt-rebuilt rows). Report
      rows deleted.
- [ ] **E6** Pre-warm in tmux (`prewarm16`): `prewarm_summaries.py --pages fi:1256,fi:1150,fi:440,fi:T
      --ui sv,en`. For each `(page, ui)`: build the fi default if missing; native sibling exists ->
      build the sibling's default row (no force); else -> translation build. Log per item: `native
      sv:<id>` or `translated`, calls, failed calls, strings, fallbacks, tokens, seconds. Zero failed
      calls (retry once with `--force`, which forces ui rows and sibling defaults only, never the fi
      defaults of 1256/1150/440).
- [ ] **E7** Ask: `build_answers.py --questions data/demo-questions-i18n.tsv --ui fi,sv,en --workers 1`
      (no force). The 9 ui rows have `source_hash` NULL so they are rebuilt, all 9 with `calls=1`
      (B5), `fallbacks=0`, `errors=0`; all 9 then have a non-NULL `source_hash`. Check: for the en
      hero with `ui=en`, no milestone `answer` or `facts[].text` is Finnish (print them in the
      evidence); milestone years and `changed_by.rev_id` still equal the default (015's C7 check).
- [ ] **E8 Live staleness check** (ui rows only):
      `UPDATE wikirag.summary_cache SET source_hash=REPEAT('0',64) WHERE lang='fi' AND page_id=T AND ui='sv'`
      -> curl `?ui=sv` shows `variant "fallback"` -> within 120 s a curl shows `variant "translated"`
      and the column again equals `SHA2(<T default row json>, 256)` (report that query and the
      `summary translated` log line). Same for one ask ui
      row (`ui='en'`, hero en question): curl shows `out_lang null`, then `out_lang "en"` with an
      unchanged milestones map.
- [ ] **E9** Repeat E2 to `*_after*.tsv`; `diff` shows no changed or removed default line (new
      sv/en sibling defaults and T's default may be added).
- [ ] **E10 Checks (curl on the VPS):**
      - Talvisota `ui=sv` and `ui=en`: `variant native`, `article.lang` sv/en, `mode llm`, every fact
        `source` a substring of that article's text (script, not by eye), `fi_history` with ≥ 1 ghost.
      - Same for 1150 and 440 where a sibling exists, else `variant translated`.
      - `T` `ui=sv`: `variant translated`, deep compare with `T` default except translated keys
        (script): 0 differences.
      - Cache-hit median of 10 curls < 300 ms for every pre-warmed `(page, ui)` and the 9 ask ui keys.

## Assumptions
- 015 is merged and correct; its default ask rows and helpers are reused as-is.
- `wikidata_id` identifies the same topic across languages (as `rag_common.other_languages` already
  assumes). Several articles with the same `wikidata_id` in one language: lowest `page_id` wins.
- A translated row is keyed by the requested article's current `rev_id`, so a new Wikipedia revision
  is a plain miss; `source_hash` covers rebuilds of the same revision (e.g. `--force` pre-warm).
- A native sv/en summary is grounded on its own text (009's check); no translation is involved.
- Existing 013 ui rows in `summary_cache` are deleted (E5); existing ui rows in `answer_cache` are
  treated as stale (NULL hash) and rebuilt (E7).

## Scope
- May edit (Hydrogen):
  - `backend/summary.py`;
  - `backend/main.py` (the `/api/summary` route only, and only if needed);
  - `backend/ask.py` (ui path, cache SQL/DDL and translator aliases only, after 015);
  - `backend/tests/test_summary.py`, `backend/tests/test_ask.py` (add tests; rewrite only C5's part
    and 015's test (g) per C4b);
  - `backend/scripts/migrate_016_source_hash.sql` (new);
  - `backend/scripts/prewarm_summaries.py`;
  - `scripts/build_answers.py` (only if E7 needs it);
  - `src/api.js` (only if needed, never `MOCK` values), `src/mock/index.js` (`mockGetSummary` only),
    `src/mock/contract.test.js` (summary and ask test blocks only);
  - `src/ui.js` (Summarize rendering only), `src/styles.css` (only a missing class, existing tokens);
  - `src/i18n.js`, `src/i18n.test.js`;
  - `artifacts/screenshots/016-summarize-multilingual/`.
- On the VPS may: copy those files to `~/wikimemory/`, run the migration once, restart only the `api`
  tmux, run E2–E10 (jobs in `tmux new -d -s prewarm16|answers16 '...'`), delete `summary_cache` rows
  with `ui <> ''`, update `source_hash` of ui rows in E8.
- Must not touch: `docs/memory/*`, `docs/specs/*`, `docs/design/*`; `backend/history.py`,
  `backend/rag_common.py`, other routes in `main.py`; default (`ui=''`) rows of `summary_cache` and
  `answer_cache` (no update or delete; inserts of missing defaults only); any `wikihistory` table;
  container 3308; the organizers' repos, venvs and tmux sessions `app`/`tm`/`svt`; `src/scene.js`,
  `src/main.js`, Ask UI code, `src/mock/fixtures.js`, `src/mock/road_stations.js`.

## Boundaries
- Always: read ARCHITECTURE.md first; prepared statements; bind 127.0.0.1; long jobs in tmux; run
  pytest (VPS), `npm test` and `REAL=summary,ask` before reporting; keep default prompts and
  default responses byte-identical.
- Ask first (via `orca orchestration ask`): any schema change beyond the two `ADD COLUMN`s (e.g. a
  `wikidata_id` index); deleting rows other than `summary_cache ui <> ''`; any edit outside scope; a
  failing mock-mode contract assertion; a demo article whose sibling cannot be summarized.
- Never: translate, send to the LLM or alter a `source` / `source_sentence`, heading, section `text`
  or ghost text; call an LLM in a request handler; rebuild or force the fi default rows of
  1256/1150/440; present mock text as Wikipedia; commit or print `ANTHROPIC_API_KEY`; delete or
  weaken tests.

## Open questions (defaults chosen; report, do not block)
- **Show the Finnish original from a native summary?** Default: no switch in this spec; the article
  panel's language buttons already open the fi article.
- **fi default row missing for `fi_history`:** default `null`, no background build. Alternative:
  schedule the fi default build too.
- **Translate `fi_history` / ghost headings?** Default: no; Wikipedia text stays verbatim (013 rule).
- **Partial translation fallback** (some strings untranslated): default accept and log, but require
  `fallbacks=0` for every pre-warmed row.
- **A native sibling that is a stub** (short article, `sections: []`): default still native (native
  first). Report which demo siblings are short.
- **Native label wording** (fi/sv strings above were written by the spec writer): the orchestrator may
  ask a native speaker to skim them before the demo.

## Approach (Hydrogen)
1. Read the merged 015 `ask.py` ui path (`build_and_cache_ask` ui branch, `_translate_strings`).
2. TDD the pure parts first (C2, C3 with fakes): `source_hash`, `collect_summary_translatable`,
   `apply_summary_translations`, shared `translate_strings`.
3. Implement A1–A6, then B1–B5; fix C5 and C4b; run pytest locally if possible, then on the VPS.
4. Mock + contract (D2, D3), `npm test`; i18n (D4); UI (D5).
5. Deploy and run E1–E10 in order; then real-mode contract and Playwright.
The worker may split into subtasks (backend / mock+contract / UI) but reports once.

## Commands
- SSH: `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes root@72.61.20.120`
- Tunnel: `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes -N -L 8002:127.0.0.1:8002 root@72.61.20.120`
- Copy: `scp -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes backend/summary.py backend/ask.py root@72.61.20.120:~/wikimemory/backend/`
  (tests to `~/wikimemory/backend/tests/`, scripts to `~/wikimemory/backend/scripts/`).
- Migration (VPS): `docker exec -i mariadb-vector-wikipedia-rag-mariadb-1 mariadb -uwikirag -pwikirag wikirag < ~/wikimemory/backend/scripts/migrate_016_source_hash.sql`
- Restart API (VPS): `tmux kill-session -t api; tmux new -d -s api 'cd ~/wikimemory && set -a && . ./.env && set +a && .venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8002 > api.log 2>&1'`
- Pytest (VPS): `cd ~/wikimemory/backend && ~/wikimemory/.venv/bin/python -m pytest tests/test_summary.py -q` and `cd ~/wikimemory && .venv/bin/pytest backend/tests/test_ask.py -q`
- Pre-warm (VPS): `tmux new -d -s prewarm16 'cd ~/wikimemory/backend && set -a && . ~/wikimemory/.env && set +a && ~/wikimemory/.venv/bin/python scripts/prewarm_summaries.py --pages fi:1256,fi:1150,fi:440,fi:<T> --ui sv,en > ~/wikimemory/prewarm16.log 2>&1'`
- Answers (VPS): `tmux new -d -s answers16 'cd ~/wikimemory && set -a && . ./.env && set +a && .venv/bin/python scripts/build_answers.py --questions data/demo-questions-i18n.tsv --ui fi,sv,en --workers 1 > answers16.log 2>&1'`
- SQL (VPS): `docker exec mariadb-vector-wikipedia-rag-mariadb-1 mariadb -uwikirag -pwikirag wikirag -e "<sql>"` (`-N -B` for TSV snapshots).
- Rows: `SELECT lang, ui, COUNT(*), SUM(source_hash IS NOT NULL) FROM wikirag.summary_cache GROUP BY lang, ui; SELECT ui, COUNT(*), SUM(source_hash IS NOT NULL) FROM wikirag.answer_cache GROUP BY ui`
- Sample: `curl -s 'http://127.0.0.1:8002/api/summary/fi/1256?ui=sv' | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("variant"), d["article"]["lang"], d["article"]["page_id"], d.get("out_lang"), d["mode"], (d.get("fi_history") or {}).get("article"))'`
- Timing: `for i in $(seq 10); do curl -s -o /dev/null -w '%{time_total}\n' '<url>'; done | sort -n | sed -n 5,6p`
- Local: `npm test`; `REAL=summary,ask API_BASE=http://127.0.0.1:8002 npm test`; `npm run build`;
  `npm run dev` with the tunnel up.

## Playwright
`playwright-cli` against `npm run dev` + real API. Screenshots to
`artifacts/screenshots/016-summarize-multilingual/`. Count console errors and failed requests on every
flow (must be 0).
1. UI sv -> Talvisota chip -> Summarize -> overview: Swedish article title, "Sammanfattning av
   artikeln i svenskspråkiga Wikipedia" -> `01-native-sv-overview.png`; a section card ->
   `02-native-sv-section.png`; go to the end -> fi history card "Redigeringshistorik från
   finskspråkiga Wikipedia" with Finnish headings -> `03-native-sv-fi-history.png`; next ghost card
   with the same label -> `04-native-sv-ghost.png`.
2. UI en, same -> `05-native-en-overview.png`, `06-native-en-fi-history.png`.
3. UI sv -> search `T` -> Summarize -> "Maskinöversatt från finskspråkiga Wikipedia" label, a fact
   with Swedish claim + Finnish source quote + `oldid=` link -> `07-translated-sv-overview.png`; a
   ghost card with the history label -> `08-translated-sv-ghost.png`.
4. UI fi -> Talvisota -> Summarize -> no new labels, same as before -> `09-fi-unchanged.png`.

## Evidence required in worker_done
One consolidated report (per-subtask evidence if split):
- Files changed (must match Scope) and `git diff --stat`; the empty A5 grep.
- Pytest counts on the VPS for both files, with C1–C5 named; `npm test` counts (mock) and
  `REAL=summary,ask` counts; `npm run build` result.
- Migration output, `SHOW CREATE TABLE` for both tables, row counts by `ui` before/after migration.
- E3 candidates + chosen `T`; E4 siblings table, index result and lookup time.
- E5 rows deleted; the `prewarm16.log` per-item lines; `build_answers.py` SUMMARY and the 9
  `ask translated` lines.
- Row counts after pre-warm: `summary_cache` by `(lang, ui)` with `source_hash` non-NULL counts;
  `answer_cache` by `ui`.
- E8 output (fallback then translated, for summary and ask) with the log lines.
- E9 `diff` outputs.
- E10: trimmed curl samples (`variant`, `article.lang/page_id/title`, `out_lang`, `mode`, first fact
  `label/value/source`, `fi_history.article`, ghost count) for 1256 sv/en, 1150 sv/en, 440 sv/en,
  T sv; the grounding-script output; the deep-compare output for T; cache-hit medians per key.
- Playwright commands, screenshot paths 01–09, console/failed-request counts.
- Open issues (short siblings, fallbacks, any wording that did not fit).

## Failure semantics
Any of these means the Task failed (not a deliverable):
- non-zero pytest, `npm test`, `REAL=summary,ask` contract or `npm run build` exit;
- Talvisota `ui=sv` or `ui=en` not `variant "native"` with sources from the sv/en article text;
- `T` `ui=sv` differing from its default anywhere except the translated keys and
  `out_lang`/`variant`/`requested`;
- a translated, sent or altered `source` / `source_sentence` / heading / section text / ghost text;
- more than 1 LLM call for any translated row (summary or ask), or 0 calls for an ask ui variant
  with translatable strings (B5);
- a Finnish milestone `answer` / fact `text` left in an en or sv ask ui variant of the hero questions;
- a stale row served as fresh, or a fresh row re-translated;
- an LLM call or SVT query in a request handler for this feature;
- a changed or deleted default (`ui=''`) row in either table (E9 diff);
- a missing pre-warmed row, a failed pre-warm call, or a cache-hit median ≥ 300 ms;
- a `ui` absent / `ui == lang` response that differs from before;
- any edit outside Scope, any touch to container 3308 or the `app`/`tm`/`svt` sessions.

A mismatch in E10 is reported as a `question` with both payloads (trimmed). It is never loosened.

After merge the orchestrator updates `docs/memory/ARCHITECTURE.md` (`summary_cache` /
`answer_cache` columns `ui`, `source_hash`) and `STATUS.md`.
