# Spec 009: GET /api/summary/{lang}/{page_id} (sections + LLM + ghost sections + cache)

Read docs/memory/ARCHITECTURE.md first (Infrastructure: SSH, Docker-only `mariadb` client, tmux,
127.0.0.1 binding; Schemas; "Reuse, don't rewrite"; Rules: SVT time zone + full timestamps, LLM rules).

## Goal
Serve the Summarize view from real data: split the current `wikirag.article` text into "##" sections,
summarize each section with Claude (JSON only, grounded, every fact with its source sentence), add
per-section edit history and ghost sections (sections that existed in past versions but are gone now)
from `wikihistory.article FOR SYSTEM_TIME` snapshots, and cache the result in
`wikirag.summary_cache`. The demo never waits for a live LLM call: a cache miss answers at once with
an extractive (non-LLM) summary and fills the cache in the background. Pre-warm the three demo
articles. Switch the frontend's summary mock flag off only after the contract test passes against
the real API.

## Dependencies
- Spec 002 (wikihistory on 3307): done.
- Spec 006 (FastAPI backend in `backend/`, `history.py` copied in, app on 127.0.0.1:8002): must be done.
- Spec 004 (per-endpoint mock flags in `src/api.js` + a way to run `src/mock/contract.test.js`
  against the real API): must be done.
- History-stats spec (`wikihistory.month_stats`): optional; used only for `war_years` (see below).
- Can run in parallel with other specs only if they do not edit the same summary blocks of
  `src/api.js` / `src/mock/contract.test.js` and the app's route list (merge conflicts otherwise).

## Response contract (unchanged shape, additive fields marked NEW)
Shape is the one `src/mock/road_stations.js` `buildSummaryForStar()` returns today:
```json
{
  "article": {"lang": "fi", "page_id": 1256, "wikidata_id": "Q134949", "title": "Talvisota",
              "url": "https://fi.wikipedia.org/wiki/Talvisota", "words": 8395,
              "reading_minutes": 35, "has_history": true},
  "mode": "llm",                                   // NEW: "llm" | "extractive" | "mock"
  "rev_id": 23200000,                              // NEW: wikirag.article.rev_id the summary is for
  "tldr": "…",
  "facts": [{"label": "…", "value": "…", "source": "<verbatim sentence>"}],   // <= 3; source NEW
  "sections": [{
    "no": 1, "heading": "Tausta", "words": 2978, "reading_minutes": 12,
    "one_line": "…", "summary": "…",
    "facts": [{"label": "…", "value": "…", "source": "<verbatim sentence>"}],  // NEW, <= 3, may be []
    "text": "## Tausta\n\n…",                     // the section's Markdown from wikirag, verbatim
    "history": {"added_year": 2003, "changes": 14, "war_years": [2007, 2014]}  // null if no history
  }],
  "ghost_sections": [{
    "after_no": 5, "heading": "…", "from_year": 2007, "removed_year": 2015,
    "text": "<cleaned old text>", "oldid": 9876543             // oldid NEW (link back ?oldid=)
  }]
}
```
Errors: unknown `lang` (not fi/sv/en) or unknown article -> HTTP 404 `{"detail": "..."}`.

## Rules for building the response
1. **Article row:** `SELECT lang, page_id, rev_id, wikidata_id, title, url, text FROM wikirag.article
   WHERE lang=? AND page_id=?` (prepared). `words` = whitespace tokens of `text`;
   `reading_minutes = max(1, round(words/240))` (same for sections). `has_history` = fi and a row
   exists in `wikihistory.article` for that page_id.
2. **Sections:** lead = text between the "# title" line and the first line starting with "## ".
   Each "## " line starts a section; its `text` runs to the next "## " (keeps "###" sub-headings).
   Drop reference/boilerplate sections by heading (case-insensitive, exact match):
   fi `Lähteet, Viitteet, Lähdeviitteet, Huomautukset, Kirjallisuutta, Aiheesta muualla, Katso myös`;
   sv `Referenser, Källor, Noter, Se även, Externa länkar, Litteratur`;
   en `References, Notes, Sources, See also, External links, Further reading, Bibliography`.
   Drop sections under 20 words. Number the kept ones `no` = 1..n.
3. **Short article:** if article `words < 1500` or fewer than 4 kept sections ->
   `sections: []`, `ghost_sections: []`; only `tldr` + `facts` (from the lead, or the whole text if
   the lead is under 40 words). Same rule as the mock.
4. **LLM (mode "llm")**, Python `anthropic` SDK, key from env `ANTHROPIC_API_KEY` (VPS
   `~/wikimemory/.env`, loaded by the service start command, e.g. `set -a; . ~/wikimemory/.env; set +a`;
   never logged, never in the repo). Model from env `SUMMARY_MODEL`, default `claude-haiku-5-5`
   (tested OK on the VPS). One call for the article (input: title + lead + list of section headings ->
   `tldr`, `facts`) and one call per kept section (input: that section's `text` -> `one_line`,
   `summary`, `facts`). Request shape:
   ```python
   client.messages.create(
       model=SUMMARY_MODEL, max_tokens=4000,
       output_config={"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}},
       system=SYSTEM_PROMPT,
       messages=[{"role": "user", "content": section_text}],
   )
   # check response.stop_reason == "end_turn" first; then json.loads(first text block)
   ```
   `SCHEMA` (section): object, `additionalProperties: false`, required
   `one_line` (string), `summary` (string), `facts` (array of objects `{label, value, source}`, all
   strings, `additionalProperties: false`). Article schema: `tldr` (string) + same `facts`.
   Do not send `thinking`, `temperature`, `budget_tokens` or an assistant prefill (400 on this model).
   System prompt (fixed constant, so later prompt caching is possible): use only the given text, no
   outside knowledge; write in the article's language; `one_line` = 1 sentence, `summary` = 2–3
   sentences, `tldr` = 3 sentences; up to 3 facts, each `source` copied verbatim as one full sentence
   from the given text; output JSON only.
5. **Grounding check (server-side, not trusted to the model):** keep a fact only if its `source`,
   whitespace-normalized, is a substring of the whitespace-normalized input text; drop the rest and
   count them. Truncate facts to 3. If a call fails (API error, `stop_reason` != `end_turn`
   including `refusal` / `max_tokens`, invalid JSON) that section (or the article header) uses the
   extractive values of rule 6; log it; the response still has `mode: "llm"`.
6. **Extractive (mode "extractive", no LLM):** `one_line` = first sentence of the section's prose
   (skip heading lines), `summary` = first 3 sentences, `tldr` = first 3 sentences of the lead,
   `facts: []` everywhere. Strip Markdown link/emphasis syntax only. Verbatim text = grounded by
   construction.
7. **Section history + ghosts (fi with history only; else `history: null`, `ghost_sections: []`):**
   - Snapshots: `SET time_zone='+00:00'`; take one snapshot per year at `'YYYY-01-01 00:00:00'` from
     the year after the first `row_start` to the current year, plus the current row. Use the
     organizers' `history.py` `as_of()` if its signature fits, else
     `SELECT rev_id, text FROM wikihistory.article FOR SYSTEM_TIME AS OF TIMESTAMP ? WHERE page_id=?`.
     Max ~25 single-row queries per article; no whole-history scan.
   - Level-2 headings per snapshot: from `history.py` `clean()` blocks if they keep the level;
     otherwise regex `^==\s*([^=].*?)\s*==\s*$` (multiline) on the raw wikitext for headings only.
     Compare headings case-folded and stripped.
   - `history.added_year` = first snapshot year in which the current section's heading appears (the
     current year if never); `changes` = number of consecutive snapshot pairs where that section's
     `clean()` text differs; `war_years` = years with >= 1 edit-war month in `wikihistory.month_stats`
     (disputes >= 3) in which the section changed; `[]` if `month_stats` does not exist.
   - Ghost = level-2 heading present in >= 2 snapshots, absent from the latest snapshot and from the
     current sections, and not in the rule-2 drop list. `from_year` = first year present,
     `removed_year` = first snapshot year after its last presence, `text` = its `clean()` paragraphs
     from the last snapshot that had it (cut at 600 chars on a word boundary), `oldid` = that
     snapshot's `rev_id`, `after_no` = `no` of the nearest preceding heading in that snapshot that is
     also a current section (0 if none). At most 5 ghosts, longest-lived first, then sorted by
     `after_no`. Renamed sections may show up as ghosts: accepted limit (comment `shortcut:` in code).
8. **Cache:** table
   `wikirag.summary_cache(lang VARCHAR(3), page_id INT UNSIGNED, rev_id BIGINT UNSIGNED, json LONGTEXT
   NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (lang, page_id, rev_id))`
   (`CREATE TABLE IF NOT EXISTS`, created by the code/pre-warm script). Only `mode: "llm"` results are
   stored. Key = current `wikirag.article.rev_id`, so a newer article revision is a miss.
9. **Request flow:** hit -> return cached JSON. Miss -> build and return the extractive response
   immediately (with history + ghosts), and schedule a FastAPI `BackgroundTasks` job that builds the
   LLM version and writes the cache. An in-process set of `(lang, page_id, rev_id)` prevents duplicate
   jobs (single uvicorn worker assumed). Env `SUMMARY_LLM=0` disables background LLM jobs. The
   request handler never awaits an LLM call.

## Acceptance criteria
- [ ] `GET /api/summary/{lang}/{page_id}` is served by the spec-006 app on 127.0.0.1:8002 and follows
      the contract and rules above.
- [ ] Unit tests (pytest, no network, LLM client faked) cover: section split + drop list + <20 words;
      short-article rule; grounding filter drops a fact whose `source` is not in the text; failed LLM
      call falls back to extractive values; ghost detection, `added_year`, `changes`, `after_no` on a
      synthetic snapshot list; cache miss returns `mode: "extractive"` without calling the LLM and
      schedules exactly one job for repeated misses.
- [ ] `backend/scripts/prewarm_summaries.py` (default `fi:1256 fi:1150 fi:440`, args
      `--pages fi:1256,...`, `--force` to rebuild) builds synchronously with the same code and writes
      `summary_cache`; prints per article: sections, ghosts, facts kept/dropped, failed calls,
      seconds, input/output tokens. Run on the VPS; all three demo articles end with a cache row and
      zero failed calls (retry once with `--force` for failures).
- [ ] After pre-warm, `GET` for 1256, 1150, 440 returns `mode: "llm"`, served from cache in
      < 300 ms (measured with `curl -w '%{time_total}'`, 5 runs, report median).
- [ ] A non-pre-warmed fi article with history returns `mode: "extractive"` in < 3 s and becomes
      `mode: "llm"` on a later request; an sv or en article returns `history: null` sections and
      `ghost_sections: []`.
- [ ] Every fact in the three demo responses has a `source` that is a substring of its section's
      `text` (or of the article text for top-level facts), checked by a script, not by eye.
- [ ] `src/mock/contract.test.js` summary test: shape assertions (incl. `mode`, fact `source`,
      section `facts` array, ghost fields, `facts.length <= 3`, short-article `sections: []`) run in
      both mock and real mode; mock-only assertions (`[mock]` text, exact counts 13/11/10, Jatkosota
      headings, `words: 8395`) run only when the summary endpoint is mocked; real mode also checks
      each fact `source` is a substring of the response text. Mock output (`buildSummaryForStar`)
      gains `mode: "mock"`, `rev_id`, section `facts`, fact `source`, ghost `oldid`, with all mock
      text still marked "[mock]".
- [ ] Contract test passes against the real API (spec 004's real mode, tunnel to :8002), and only
      then the summary flag in `src/api.js` is set to real. `npm test` (mock mode) still passes.

## Assumptions
- Spec 006 decides the module layout, venv and start command; this spec adds one module and one
  route registration. `anthropic` is added to the backend requirements (authorized here).
- `claude-haiku-5-5` at effort `low` is good enough for Finnish summaries; switching to
  `claude-sonnet-5-5` is a `SUMMARY_MODEL` env change, no code change. Haiku 5.5 has no server-side
  refusal fallback, so refusals take the extractive path (rule 5).
- Prompt caching is skipped: the fixed system prompt is below the minimum cacheable prefix, and each
  section is called once per revision.
- Yearly snapshots are fine-grained enough for `added_year`/ghosts in the demo.
- Output is in the article's language (fi summaries for fi articles), like the mock.

## Scope
- May edit: `backend/summary.py` (new), the spec-006 app module (register the route only),
  backend requirements file (add `anthropic`), `backend/scripts/prewarm_summaries.py` (new),
  `backend/tests/test_summary.py` (new), `src/mock/contract.test.js` (summary test block only),
  `src/mock/road_stations.js` (`buildSummaryForStar` only), `src/api.js` (summary flag only).
- On the VPS may: create `wikirag.summary_cache`, copy the backend files, restart only our own
  backend service, run the pre-warm in `tmux new -d -s prewarm '...'`.
- Must not touch: `docs/memory/*`, other specs, other endpoints, `src/ui.js`, `src/scene.js`, the
  organizers' repos/venvs/tmux sessions `app` and `tm`, container 3308, any `wikihistory` table.

## Boundaries
- Always: read ARCHITECTURE.md first; prepared statements; `SET time_zone='+00:00'` and full
  `YYYY-MM-DD HH:MM:SS` timestamps in SVT queries; bind 127.0.0.1; run pytest + contract test before
  reporting; reuse the organizers' `history.py` (`clean()`, `as_of()`) as copied by spec 006, never
  rewrite them.
- Ask first (via `orca orchestration ask`): new dependencies beyond `anthropic`, schema changes
  beyond `summary_cache`, response-shape changes beyond the NEW fields above, edits outside scope.
- Never: commit or print the API key; call the LLM inside the request handler; present mock text as
  Wikipedia; delete failing tests.

## Open questions (defaults chosen)
- Ghost text is old Wikipedia text, not an LLM summary. Default: show cleaned old text with an
  `oldid` link back (CC BY-SA). Ask the orchestrator if ghosts should get LLM one-liners too.
- Section `facts` are new in the contract; the UI does not show them yet. Default: API returns them,
  UI change is a later spec.
- Pre-warm all 50 history articles too? Default: only the three demo articles; `--pages` allows more.
- If spec 004 offers no real-API mode for the contract test, the worker asks before inventing one.

## Approach (Hydrogen)
1. Read ARCHITECTURE.md, spec 006's backend layout, `history.py` (`clean()` output format,
   `as_of()` signature), and the current summary mock + contract test.
2. Write `backend/summary.py` + unit tests until green.
3. Register the route; deploy to the VPS; create the table; run pre-warm in tmux; check log.
4. Measure hit/miss times with curl; run the grounding check script on the three demo responses.
5. Update the contract test + mock; run it in mock and real mode; then flip the summary flag.

## Commands
- SSH: `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes root@72.61.20.120`
- Unit tests (VPS, our venv): `cd ~/wikimemory/backend && ~/wikimemory/.venv/bin/python -m pytest tests/test_summary.py -q`
- Pre-warm: `ssh ... "tmux new -d -s prewarm 'cd ~/wikimemory/backend && set -a && . ~/wikimemory/.env && set +a && ~/wikimemory/.venv/bin/python scripts/prewarm_summaries.py > ~/wikimemory/prewarm.log 2>&1'"`
- Sample + timing (on VPS): `curl -s -o /tmp/s1256.json -w '%{time_total}\n' http://127.0.0.1:8002/api/summary/fi/1256`
- Cache rows: `docker exec mariadb-vector-wikipedia-rag-mariadb-1 mariadb -uwikirag -pwikirag wikirag -e "SELECT lang, page_id, rev_id, LENGTH(json), created_at FROM summary_cache"`
- Contract test, mock: `npm test`; real: spec 004's real-mode command with an SSH tunnel
  `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes -N -L 8002:127.0.0.1:8002 root@72.61.20.120`.

## Evidence required in worker_done
One consolidated report:
- Files changed.
- pytest output (pass/fail counts); `npm test` counts in mock mode and in real mode.
- Pre-warm log: per article sections, ghosts, facts kept/dropped, failed calls, seconds, tokens.
- `curl` sample of each case (trimmed: `article`, `mode`, `tldr`, first section, first ghost):
  fi 1256, 1150, 440 (cached), one uncached fi article (extractive, then llm), one sv or en article,
  one 404.
- Measured times: cache hit median of 5 for each demo article; extractive miss time.
- Grounding check output: facts checked / passed for the three demo articles.
- `summary_cache` row count and the rows listed; `SHOW CREATE TABLE wikirag.summary_cache`.
- The `src/api.js` diff showing the summary flag switched to real.
- Open issues / assumptions (e.g. a demo article without history, rename-as-ghost cases seen).

## Failure semantics
Non-zero pytest or contract-test exit, a demo article not in `summary_cache`, a request path that
awaits an LLM call, or a fact whose `source` is not in the text = Task failed (not a deliverable).
