# wikimemory — demo notes for judges

## Pitch

wikimemory is a 3D galaxy of Finnish-history Wikipedia articles (fi, sv, en; 29,460 stars). You can
ask a question and get an answer with sources, and then see how Wikipedia's answer to that question
changed over the years, edit by edit, with the editor who made each change. It is built for **both
tracks**. RAG: MariaDB `VECTOR` search over 83,797 bge-m3 chunks finds the passages. SVT: a
system-versioned `wikihistory` table with 862,076 real revisions, read with
`FOR SYSTEM_TIME AS OF`, shows what the article said in each year. Every LLM output is grounded in
the text it was given and is cached in MariaDB, so the demo never waits for the model.

## Demo script (about 3.5 minutes)

1. **Galaxy (20 s).** Open the app. Say: "Each star is one article. Colour shows the language, and a
   red ring marks an article that had an edit war. Position comes from UMAP over the bge-m3 vectors."
   Drag to orbit, then move the time slider (2003–2026 edit histogram).
2. **Search (15 s).** Type `talvisota` and pick *Talvisota* (fi 1256). Say: "Search runs on MariaDB
   vector search. The small dots show the same article in the other languages."
3. **Ask, the hero question (60 s).** Open Ask and type `How did the Winter War end?` (or
   `Miten talvisota päättyi?`). Say: "The answer cites its source sentences. Under it, 'This answer
   changed N times' shows a timeline of milestones":
   - 2003: the peace treaty is signed on "13 March".
   - 2005: the article is rewritten (rev 590107).
   - 2006: the text becomes "the evening of 12 March, in effect 13 March", **changed by** rev 1862876,
     user Whiskey~fiwiki. We checked by hand that this is the one real date change. The 2004 flips and
     the removals in 2005–2010 were vandalism, reverted within 1–2 minutes.
   - 2009 (en) / 2011 (fi): new facts are added (105 days, 1721 comparison).
   Say: "Each year's answer is built from `FOR SYSTEM_TIME AS OF` text, not from today's article."
4. **Summarize (45 s).** Go back to the Talvisota star and click **Summarize**. Say: "One card per
   section, 14 in all. Each fact keeps its exact source sentence (92 of 92 facts grounded on the three
   demo articles). Each card shows that section's history. The dashed cards are **ghost sections**:
   5 sections that existed in the past and were later removed."
5. **Through time (40 s).** Open **Through time**. Pick a year, for example 2006, to read the article
   AS OF that date. Then show the word diff between two revisions. Say: "This is a plain
   `SELECT ... FOR SYSTEM_TIME AS OF` on the system-versioned table, and each version links back to
   Wikipedia's `?oldid=`."
6. **Edit wars (20 s).** In the same panel, show the monthly edits, reverts and disputes. Say:
   "Talvisota has 2,143 versions, 328 reverts, 88 disputes and 7 edit-war months. Across dataset M
   there are 45,668 reverts, 15,633 disputes and 890 edit-war months. All of it is precomputed in SQL
   tables, never computed per request."
7. **Language (15 s).** Switch the UI to `sv`, then `en`. Say: "The summaries and answers come back in
   the reader's language. The cache is keyed by UI language."
   (Do not run Ask with the Swedish question here. See Known limits.)
8. **Close (15 s).** Say: "In short: vectors find the passage, system versioning shows how it changed,
   and MariaDB stores all of it, including the LLM cache."

Do not use demo questions 32, 34 or 39 from `data/demo-questions.tsv` (1-based). Their top article is
wrong because retrieval misses it.

## How MariaDB is used

**Vector search (RAG).** `wikirag.chunk_vector` has a `VECTOR(1024)` column with a `VECTOR INDEX`
(M=16, cosine) over 83,797 bge-m3 chunks (fi 51,541 / sv 11,810 / en 20,446). The query embeds the
question, runs `ORDER BY VEC_DISTANCE_COSINE(...) LIMIT n` in a subquery on the vector table alone,
then joins the text outside the subquery (a flat join is about 50× slower). Evaluation on the
organizers' 37 test questions:

| Retrieval | hit@5 | hit@10 | MRR | latency |
|---|---|---|---|---|
| article vectors (organizers' baseline) | 76% | 86% | 0.65 | 16.9 ms |
| **chunk vectors (ours)** | **92%** | **95%** | **0.72** | 28.0 ms |
| hybrid | 78% | 95% | 0.57 | 606 ms |

Hybrid was slower and no better, so we do not use it. One question got worse with chunks
(Ryti–Ribbentrop-sopimus).

**System versioning (SVT).** `wikihistory.article` is `WITH SYSTEM VERSIONING`. Its invisible
`row_start`/`row_end` columns hold the real Wikipedia edit times. We loaded dataset M (19,742
articles, 862,076 versions) with the organizers' loader, using `system_versioning_insert_history`.
- Through time, Ask and section history read `FOR SYSTEM_TIME AS OF TIMESTAMP ?` (one snapshot per
  year). Timelines read `FOR SYSTEM_TIME ALL`.
- Precomputed tables: `history_stats` (versions, reverts, disputes, war months per article),
  `month_stats` (371,512 rows) and `global_month_stats` (285 rows). Rebuilding them took 79 s.
- We merged `wikihistory` into the same server as `wikirag`. This lets **one SQL statement** join
  vector search with `FOR SYSTEM_TIME AS OF` (`SINGLE_STMT_HISTORY_SQL` in `backend/ask.py`).

**Caches in MariaDB.** `summary_cache` and `answer_cache` hold the LLM's JSON output, keyed by
article revision or question plus the `ui` language. A cache hit takes about 2–7 ms.

## What we learned

**A vector index on a system-versioned table works, but loses recall under AS OF.** We built
`chunk_vector_hist` (17,791 rows, 50 articles, 926 yearly snapshots) as a `VECTOR INDEX ... WITH
SYSTEM VERSIONING` table on MariaDB 12.3.3, filling it with `system_versioning_insert_history = 1`.
- MariaDB accepts the index, and `FOR SYSTEM_TIME AS OF` really uses it: 9.5–13 ms, against
  1.27–1.58 s for a full scan.
- However, the HNSW graph holds current and historical rows together and filters on
  `row_start`/`row_end` only **after** the search. At AS OF 2015 only 4.3% of the rows are live, so
  the index found 5–7 of the exact top 10 (overlap@10). In one case it dropped the main answer
  passage for "Who was the president of Finland from 1956 to 1982?".
- More history per chunk would make this worse. We therefore kept **Way A**: search the current
  vectors, then read the old text with `FOR SYSTEM_TIME AS OF`. Full report:
  `docs/memory/research/wayb-spike.md`.

**Milestones must follow real edits, not LLM wording.** Our first version asked the LLM for an answer
every year and counted each new answer as a change. As a result, rewording looked like a change, and
the real treaty-date edit was placed one period late. Now a milestone needs a change in the numbers
(dates, counts) in the cited source sentences, and we name the revision and the user who made it.
The limit: a change that touches only names, with no number, is not detected.

## Known limits

- Change detection uses numbers only. Edits that change only names or wording are missed.
- History exists only for Finnish (dataset M). For sv/en articles there is no time view, so their
  answers map to the Finnish sibling article. 12 listed articles were missing from the dumps.
- Some demo questions miss: 32, 34 and 39 retrieve the wrong top article, and [38] finds no answer at all.
- Until spec 015 lands, answers in the sv/en UI (`?ui=`) are rebuilt separately and can show a different
  timeline (e.g. the 2006 milestone points to another revision). Demo the timeline in the Finnish UI, or
  after 015.
- Hybrid search is measured but not used. Way B is a research table only.
- Short articles (under 1,500 words or fewer than 4 sections) get an overview without section cards.
- Image license/artist credit is not yet shown in the UI.

## Run

FastAPI serves the API and the built frontend (`dist/`) on `127.0.0.1:8002` on the VPS. Open it
through an SSH tunnel, for example `ssh -L 8002:127.0.0.1:8002 <vps>`, then go to
`http://localhost:8002`.
