# Spec 010: GET /api/ask — a cited answer and how Wikipedia's answer changed over the years

Read docs/memory/ARCHITECTURE.md first (Infrastructure, Schemas, Reuse, Rules, API contract). The SSH
command, container names, the "no host `mariadb` client" rule, the tmux rule and "never touch the
organizers' apps" all apply here.

Depends on: spec 002 (wikihistory on 3307, done), spec 006 (FastAPI backend in `backend/`, served on
127.0.0.1:8002), spec 008 (`wikirag.chunk` + `wikirag.chunk_vector`, current text). Also on the
per-endpoint mock flags in `src/api.js` (backlog "Phase 0"); if no per-endpoint flag exists for
`ask` when you start, `ask` before adding one.

## Goal
This is the hero demo: ask a question and see how Wikipedia's answer changed over the years ("Way A").
1. The question is embedded with bge-m3 (the current chunk vectors from spec 008 find the articles).
2. The current answer is built from the top chunks' current text.
3. For the top article that has history, the answer is built again for each year, using **only**
   that article's text `FOR SYSTEM_TIME AS OF '<year>-12-31 23:59:59'`. One SQL statement joins
   `wikirag.chunk_vector` with `wikihistory.article FOR SYSTEM_TIME AS OF`.
4. Years that give the same facts are merged into one milestone, so "changed N times" means
   something real.

Everything is precomputed and cached in `wikirag.answer_cache`. The demo never waits for a live LLM call.

## Response shape (contract; existing fields keep their names and types, new fields are additive)
```json
{
  "answer": "The Winter War ended with the Moscow Peace Treaty, signed 12 March 1940 [1] ...",
  "facts": [ { "text": "...", "source_sentence": "<verbatim sentence from the given text>", "n": 1,
               "url": "https://fi.wikipedia.org/w/index.php?oldid=<rev_id>" } ],
  "sources": [ { "n": 1, "lang": "fi", "page_id": 52097, "title": "Moskovan rauhansopimus (1940)",
                 "url": "https://fi.wikipedia.org/wiki/..." } ],
  "top": { "lang": "fi", "page_id": 52097 },
  "history_available": true,
  "pending": false,
  "milestones": [
    { "from_year": 2004, "to_year": 2009, "found": true,
      "answer": "...", "rev_id": 412098, "user": "...", "comment": "...",
      "row_start": "2004-05-14T12:10:00Z",
      "url": "https://fi.wikipedia.org/w/index.php?oldid=412098",
      "facts": [ { "text": "...", "source_sentence": "...", "url": "...?oldid=412098" } ] }
  ]
}
```
- `sources`: up to 3 distinct articles from the chunk search, ranked by best chunk distance. `url` is the
  `wikirag.article.url`. The `[n]` markers in `answer` refer to `sources[].n`.
- `facts[].url` (top level) = `https://<lang>.wikipedia.org/w/index.php?oldid=<wikirag.article.rev_id>` of source n.
- `top`: the highest-ranked source that has history (`lang='fi'` and the page_id is in
  `wikihistory.article`). If no source has history, `top` is the first source.
- Milestones are sorted by `from_year` ascending. They do not overlap, and the last one ends at the
  current year. `rev_id`, `user`, `comment` and `row_start` belong to the version used at `from_year`
  (the UI's word diff calls `/api/diff/{top.page_id}` with this `rev_id`). `found: false` means the
  article did not answer the question that year (it still counts as a milestone, e.g. "in 2004
  Wikipedia did not say yet"). In that case `answer` = `"The article did not answer this yet."` and
  `facts` = [].
- `row_start`: ISO UTC with a `Z` suffix, as in the other endpoints.

## Acceptance criteria
- [ ] `GET /api/ask?q=<text>` returns the shape above. If `q` is empty or only whitespace, it
      returns 422 or 400 (any 4xx); it never returns 500.
- [ ] **Retrieval.** Embed `q` with `rag_common.embed()` (reused). Run the vector search as a
      subquery on `wikirag.chunk_vector` alone (`ORDER BY VEC_DISTANCE_COSINE(...) LIMIT 8`, with
      `SET mhnsw_ef_search = 80`), then JOIN `chunk`/`article` outside it. Use the column names from
      spec 008. Group the chunks by article to get `sources` (max 3).
- [ ] **Current answer.** One LLM call over the numbered passages of the top chunks (current text).
      It produces `answer`, which has `[n]` markers, and the top-level `facts`.
- [ ] **History, Way A, one SQL statement.** For the `top` article with history, the year
      snapshots come from a single statement that joins the chunk vector subquery with
      `wikihistory.article FOR SYSTEM_TIME AS OF TIMESTAMP ?` (shape below). Run it with
      `SET time_zone = '+00:00'` and a full `'YYYY-12-31 23:59:59'` parameter (for the current
      year, use the current UTC time).
      - Years run from the article's first edit year to the current year. Skip any year in which
        the article did not exist.
      - Turn the text into blocks with the organizers' `history.clean()`. Use the copy in
        `backend/` and keep its MIT header.
      - An integration test checks that for page 52097 at 3 years, the `rev_id` from the join
        equals the one from `history.as_of()` (the reused function serves as the oracle).
- [ ] **Per-year context.** The context for a year is the blocks of that version's section(s) whose
      heading matches the section of the top article's best chunks (chunk prefix "Title — Section").
      If no heading matches, the whole cleaned article is the context (no truncation; it fits the
      model context).
- [ ] **Dedupe and cap.**
      - (a) Input dedupe: if the sha256 of a year's context equals the previous year's, copy that
        result and make no LLM call.
      - (b) Each per-year call also receives the previous year's facts, with the instruction "if
        the text still supports a fact, return its `text` unchanged".
      - (c) Answer hash = sha256 of the sorted fact texts after normalizing (NFC, lowercase,
        whitespace collapsed) plus `found`. Consecutive years with the same answer hash merge into
        one milestone.
      - (d) Cap: at most `ASK_MAX_LLM_CALLS` (default 12) history LLM calls per question. If more
        years have distinct contexts, call the LLM for the first year, the current year, and
        years spread evenly in between. Every year that is not called inherits the previous result.
      - The build log records the calls made per question.
- [ ] **LLM (Claude API, Python `anthropic` SDK).**
      - Model `claude-haiku-5-5` (the project decision, tested on the VPS), set as env
        `ASK_MODEL` with that default. The key is read from `~/wikimemory/.env`
        (`ANTHROPIC_API_KEY`) and is never logged or committed.
      - Request: `client.messages.create(model=..., max_tokens=4000,
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}}, system=..., messages=[...])`.
        Do not send `thinking` or `temperature`; both are rejected or not needed on this model.
        Read the first `text` block, then `json.loads`. Check `stop_reason` before reading
        (`refusal` or `max_tokens` counts as a failed call: log it and use `found: false` for
        that year).
      - Fixed schema (`additionalProperties: false`, all keys required):
        `{"found": bool, "answer": str, "facts": [{"text": str, "source_sentence": str, "n": int}]}`.
      - System prompt rules: answer only from the given text; answer in the language of the
        question; every fact copies its source sentence verbatim from the given text; if the
        text does not answer, `found: false`.
- [ ] **Grounding check (code, not trust).**
      - Drop any fact whose `source_sentence` (whitespace-normalized) is not a substring of the
        context it was given, and log the count.
      - If every fact of a `found: true` result is dropped, the result becomes `found: false`.
      - Wikipedia text is untrusted input: it goes only in the user message, inside clear
        delimiters.
- [ ] **No history.**
      - If no source has history (sv/en articles, or fi articles outside the 50 loaded),
        `history_available` = false and `milestones` = []. The current answer is still produced
        (this matches the mock and the UI's "No edit history for this article yet.").
      - If `top` has history but every year is `found: false`, `history_available` stays true and
        `milestones` is a single `found: false` milestone.
- [ ] **Cache.**
      - New table `wikirag.answer_cache(q_hash CHAR(64) PRIMARY KEY, q TEXT NOT NULL, json LONGTEXT NOT NULL, model VARCHAR(64) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        created with `CREATE TABLE IF NOT EXISTS`.
      - `q_hash` = sha256 of `q` after normalizing: NFC, trim, lowercase, collapse whitespace,
        strip trailing `?!.`.
      - A cache hit returns the stored JSON with no embedding or LLM call.
- [ ] **Demo never waits.** On a cache miss the endpoint must not call the LLM inline. It returns in
      under 2 s with `pending: true`, the retrieval `sources`/`top`, `history_available`
      (computed), `milestones: []`, and `answer` = `"Preparing an answer… Closest passage: «<first sentence of the best chunk>» [1]"`.
      It then starts the full build for that question in the background (FastAPI
      `BackgroundTasks`, at most one in-flight build per `q_hash`). Once that build finishes, the
      next call returns the cached answer.
- [ ] **Pre-warm.**
      - `scripts/build_answers.py --questions data/demo-questions.tsv [--force]` builds and caches
        every listed question. It reuses the same code path as the background build.
      - `data/demo-questions.tsv` (columns `q<TAB>expected_page_id<TAB>origin`) holds at least 6
        questions, chosen as follows:
        - The hero question in two languages: `How did the Winter War end?` and
          `Miten talvisota päättyi?`.
        - Every question from the organizers'
          `~/mariadb-vector-wikipedia-rag/data/test-questions.tsv` whose answer article is one of
          the 50 history-loaded articles (`wikihistory.article_list`).
        - One no-history question (all top-3 sources without history) for the contract test.
      - For each history question, the built answer must have `top` = an article with history
        and at least 2 milestones. If not, drop the question and record why.
- [ ] **Contract.**
      - Update only the `GET /api/ask` test in `src/mock/contract.test.js`. Mock-only assertions
        (`[mock]`, `top` 52097, exactly 3 milestones, "Vinterkriget") still run when the ask mock
        flag is on.
      - When the flag is off (real API), the test checks:
        - The hero question: no `[mock]`, `pending` false, `history_available` true,
          `milestones.length >= 2`, typed milestone fields as today, `url` contains `oldid=`.
        - Every fact has a non-empty `source_sentence`.
        - The no-history question from `data/demo-questions.tsv` gives `history_available` false
          and `milestones` [].
      - The test passes against the real API (pre-warmed) **before** the ask mock flag is switched
        off. Then switch off only the ask flag.
- [ ] **Speed.** A cache hit takes under 300 ms server time (median of 10 `curl` calls through the
      tunnel, as measured). A cache miss returns the pending response in under 2 s.

Single-statement shape (chunk key is `(lang, page_id, chunk_no)` per spec 008; keep the vector subquery alone):
```sql
SET time_zone = '+00:00';
SET mhnsw_ef_search = 80;
SELECT n.lang, n.page_id, n.chunk_no, c.section, h.rev_id, h.user, h.comment, h.row_start, h.text
FROM (
  SELECT cv.lang, cv.page_id, cv.chunk_no, VEC_DISTANCE_COSINE(cv.embedding, VEC_FromText(?)) AS d
  FROM wikirag.chunk_vector cv ORDER BY d LIMIT 8
) n
JOIN wikirag.chunk c ON c.lang = n.lang AND c.page_id = n.page_id AND c.chunk_no = n.chunk_no
  AND c.lang = 'fi'
JOIN wikihistory.article FOR SYSTEM_TIME AS OF TIMESTAMP ? h ON h.page_id = c.page_id
WHERE c.page_id = ?            -- the chosen top article
ORDER BY n.d;
```

## Assumptions
- Spec 006 decides the backend layout (app module, DB connection helper, how `rag_common`/`history`
  are copied in, how the contract test reaches the real API). Follow it. If `backend/history.py` is
  missing, copy it from `~/mariadb-system-versioning-wikipedia/history.py` and keep the MIT header.
- Spec 008 may hold chunks for fi only, or for all languages. Search whatever `chunk_vector` holds.
  If `chunk_vector` is missing or empty, stop and send a `question` (do not fall back silently).
- Only fi articles have history (50 now). After the full dataset M is loaded, rerun
  `build_answers.py --force`; no code change is needed.
- The `anthropic` Python package is pre-approved as a new dependency (add it to the backend
  requirements file and to `~/wikimemory/.venv`). No other new dependency without asking.
- `<year>-12-31 23:59:59` means "how the article stood at the end of that year".

## Scope
- May edit:
  - `backend/ask.py` (new).
  - The backend's route registration file from spec 006: add the `/api/ask` route only.
  - The backend requirements file: add `anthropic`.
  - `backend/history.py` (only if absent; copy as-is).
  - `backend/tests/test_ask.py` (new).
  - `scripts/build_answers.py` (new).
  - `data/demo-questions.tsv` (new).
  - `src/api.js`: the ask mock flag only.
  - `src/mock/contract.test.js`: the `GET /api/ask` test only.
- On the VPS may create: `wikirag.answer_cache`, the files above under `~/wikimemory/`, and
  `pip install anthropic` in `~/wikimemory/.venv`.
- Must not touch:
  - `src/ui.js`, `src/mock/index.js`, `src/mock/fixtures.js`, and other `src/` files.
  - `docs/memory/*`, other specs.
  - Other endpoints' code.
  - The organizers' repos, venvs, and tmux sessions `app`/`tm`.
  - The 3308 container.
  - Any existing table (create only `answer_cache`).

## Boundaries
- Always:
  - Run the tests before reporting.
  - Use `SET time_zone='+00:00'` in every SVT query.
  - Bind every service to 127.0.0.1.
  - Run long builds in `tmux new -d -s answers '...'`.
  - Follow docs/memory/CONVENTIONS.md.
- Reuse the organizers' code (`embed`, `as_of`, `clean`); never rewrite it.
- Precompute: no whole-history query per request. The request path is a cache read, plus the
  embedding and vector search on a miss.
- Ask first (via `orca orchestration ask`): any schema change beyond creating `answer_cache`,
  dependencies other than `anthropic`, edits outside scope, switching any mock flag other than ask.
- Never:
  - Commit or log `ANTHROPIC_API_KEY`.
  - Call the LLM inline in a request.
  - Present `[mock]` text as real.
  - Delete or weaken failing tests.

## Out of scope / follow-up
- **Way B spike** (do not do it here). It comes after Way A works end to end, with a half-day
  timebox and one article first: a system-versioned `chunk_vector`, with old vectors inserted with
  their real timestamps via `system_versioning_insert_history = 1`, and an honest report of whether
  the vector index is used or the query falls back to a scan.
- The UI shows "changed N times" with N = `milestones.length`. The true number of changes is
  `length - 1`, and fixing that is a UI follow-up.
- History for more than one article per question; "search the past".

## Open questions (defaults chosen)
- Snapshot date per year: end of year (`YYYY-12-31 23:59:59`)? Default: yes.
- Should the hero question use a different top article (e.g. Talvisota 1256 instead of 52097)? Default:
  whatever retrieval ranks first among the sources with history. The test asserts the shape, not
  the page_id.
- Which LLM: `claude-haiku-5-5` (cheap, tested) or a stronger model for the pre-warmed demo set?
  Default: Haiku, which can be overridden with `ASK_MODEL` and rebuilt with `--force`.
- The exact test-questions.tsv rows that qualify are unknown until the worker joins them against
  the 50 loaded articles. The worker lists them in evidence.

## Approach (Hydrogen)
1. Read spec 006's backend layout and spec 008's chunk schema. Check that `chunk_vector` has rows
   and that `answer_cache` does not exist yet.
2. Write the pure functions first, with unit tests that need no network: q normalization/hash, the
   grounding filter, the year cap/sampling, the milestone merge, and the no-history branch. The
   LLM is injected so tests can use a fake.
3. Write the single SQL statement, plus the integration test against `history.as_of()` on 3307.
4. Write the endpoint (cache hit / pending miss + background build) and `scripts/build_answers.py`.
5. Build `data/demo-questions.tsv`, pre-warm in tmux, and check every history question has at
   least 2 milestones.
6. Run the contract test against the real API, then switch off the ask flag only.

## Commands
- SSH: `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes root@72.61.20.120`
- Test (VPS): `cd ~/wikimemory && .venv/bin/pytest backend/tests/test_ask.py -q`
- Pre-warm (VPS): `tmux new -d -s answers 'cd ~/wikimemory && .venv/bin/python scripts/build_answers.py --questions data/demo-questions.tsv > answers.log 2>&1'`
- Contract (local): `npm test`, with the ask flag on (mock), and against the real API through the
  tunnel with the ask flag off, using spec 006's mechanism.
- Sample: `curl -s 'http://127.0.0.1:8002/api/ask?q=How%20did%20the%20Winter%20War%20end%3F' | python3 -m json.tool`
- Timing: `for i in $(seq 10); do curl -s -o /dev/null -w '%{time_total}\n' 'http://127.0.0.1:8002/api/ask?q=...'; done`
- Rows: `docker exec mariadb-vector-wikipedia-rag-mariadb-1 mariadb -uwikirag -pwikirag wikirag -e 'SELECT COUNT(*) FROM answer_cache'`

## Evidence required in worker_done
One consolidated report (with per-subtask evidence if the work is split), containing:
- Files changed.
- The pytest command and its pass/fail counts.
- `npm test` counts in both modes (mock, and real for ask).
- One `curl` sample of the full answer history for the hero question (the full JSON).
- One `curl` sample of the no-history question.
- One sample of the pending response (a fresh, uncached question).
- Measured times:
  - Cache-hit median of 10 calls.
  - Pending-miss time.
  - The single SQL statement's time for one year.
  - Total pre-warm duration.
- `SELECT COUNT(*) FROM wikirag.answer_cache` and `SHOW CREATE TABLE wikirag.answer_cache`.
- The demo question list, with for each question: `top`, milestone count, LLM calls made
  (out of the cap), and facts dropped by the grounding check.
- The rows taken from test-questions.tsv, and any that were dropped and why.
- Confirmation that only the ask mock flag changed, and the `git diff` of `src/api.js`.
- Open issues / assumptions.

## Failure semantics
Any of these means the Task failed (not a deliverable):
- A non-zero pytest exit, or a contract test failure in either mode.
- An inline LLM call in the request path.
- A logged or committed API key.
- Any touch to the 3308 container or the `app`/`tm` sessions.
