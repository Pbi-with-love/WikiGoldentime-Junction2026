# wikimemory — demo notes for judges

## Pitch

wikimemory is a 3D galaxy of Finnish-history Wikipedia articles (fi, sv, en; 29,460 stars). You can
ask a question and get an answer with sources, and then see how Wikipedia's answer to that question
changed over the years, edit by edit, with the editor who made each change. It is built for **both
tracks**. RAG: MariaDB `VECTOR` search over 83,797 bge-m3 chunks finds the passages. SVT: a
system-versioned `wikihistory` table with 862,076 real revisions, read with
`FOR SYSTEM_TIME AS OF`, shows what the article said in each year. Every LLM output is grounded in
the text it was given and is cached in MariaDB, so the demo never waits for the model.

## Demo script (3.5 minutes, final)

Labels are the real button names on the deployed build, checked in dry run 3
(`docs/memory/research/demo-dryrun-3.md`, bundles `index-zLNeP6kO.js` and `index-BVyARc13.js`).
Start in the **English** UI (`English`, top right). Times in brackets are speaking time.

**Warm-up, 5 minutes before going on stage** (laptop at 1280×720 or larger, tunnel open):
1. Open the app and wait 10 s until the slider reads **2026** (or click once anywhere: the intro
   sweep then jumps to 2026).
2. Click the chip **How did the Winter War end?**, click the **2006–2020** card (warms the diff,
   ~1.4 s cold), then **Close**.
3. Search `talvisota`, open *Talvisota*, click **Through Time** -> **As of 2006** (warms AS OF,
   ~2.5 s cold), then **See as a road** and **Back to the sky**.
4. Click **Suomi**, open *Talvisota*, **Tiivistä**, then **Takaisin taivaalle**, click **English**.
5. Reload the page and wait for **2026** again. Keep a second tab with the same state as backup.

1. **Galaxy and time (25 s).** Say: "Each star is one Wikipedia article about Finnish history, in
   Finnish, Swedish and English: 29,460 stars. Colour is the language; red marks an edit war." Click
   the slider and press **Home**: **2001**, about 70 stars. Press **→** a few times (2004: ~2,000;
   2010: ~14,000), then **End** (2026: all). Say: "Stars are born in the year their article was
   created; the bars are edits per month."
2. **Ask, the hero (60 s).** Click the chip **How did the Winter War end?** (instant). Say: "The
   answer cites its sources ('Based on English, Finnish Wikipedia'). Below it, **This answer changed 3
   times**: 2003–2004, 2005–2005, **2006–2020**, 2021–2026." Point at the 2006–2020 card face:
   **"Edited by Whiskey~fiwiki on 7 Nov 2006 oldid=1862876"**. Say: "In November 2006 one editor
   changed the treaty date in Finnish Wikipedia: signed the evening of 12 March, fighting ended the
   next day. Before that it said 13 March." Click the card: each fact with its Finnish source
   sentence, then **Word diff against today** (~1 s). Say: "Every period is built from
   `FOR SYSTEM_TIME AS OF` text, not from today's article; `oldid` links to that exact revision."
   Note: today's English answer still says "signed on 13 March" (the English lead says so). If asked,
   that is the story: the languages disagree.
3. **Threads and road (30 s).** Scroll to **Memory threads from Talvisota** (Talvisodan tausta ≈ 91 %,
   Jatkosota 1941 →, Välirauha ≈ 84 %, ← 1808 Suomen sota). Click **Close**, click the chip
   **Talvitie: Talvisota** (0.4 s): "13 historical milestones · 1808–1944". Say: "Stations are picked
   by vector similarity and shared categories; each card shows why ('Similar (77%)') and its history
   ('Added 2004 · changed 796 times', '127 reverts · 19 disputes')." Click **Next** twice, then
   **Back to the sky**.
4. **Summary and cross-language compare (40 s).** Click **Suomi**, search `talvisota` (**Hae**),
   open *Talvisota*, click **Tiivistä**: "13 osiota · 35 min → 2 min". Say: "One card per section,
   each fact with its source sentence; faded cards are sections that were deleted in the past."
   Click **Seuraava** 8 times to **Osio 5 / 13** *Moskovan rauha* ("muokattu uudelleen 14 kertaa").
   Point at **Myös ruotsinkielisessä Wikipediassa** (section *Fredsavtalet*) only. Say: "For each
   Finnish section we find the closest Swedish and English passage with vector distance." Do not
   point at the English passage under it (*Foreign support*, a weak match until spec 027 is deployed).
   Click **Takaisin taivaalle**, then **English**.
5. **Through time and edit wars (30 s).** Search `talvisota`, open *Talvisota*, click **Through
   Time**: "2,143 versions · 328 reverts · 88 disputes · 7 edit-war months". Click **As of 2006**
   (~2.5 s; talk through it): "2006 · Edited by Höyhens on 29 Dec 2006 · oldid=2114325", and the
   slider and galaxy move to 2006 too. Say: "A plain `SELECT … FOR SYSTEM_TIME AS OF` on the
   system-versioned table, 862,076 real revisions."
6. **Geography (10 s).** **Close** the panel and the search list, click **Geography** (~3 s
   animation): the map of Finland (Rovaniemi, Oulu, Vaasa, Tampere, Turku, Helsinki, Viipuri) and
   "Unlocated articles". Say: "7,186 stars have Wikidata coordinates."
7. **Close (15 s).** Say: "Vectors find the passage, system versioning shows how it changed, and
   MariaDB stores all of it, including every LLM answer as a cache."

**Backups.**
- A step is slow (> 3 s): keep talking, do not click again. Through Time and the 2006 card are the
  slow ones; the warm-up makes them faster.
- Something breaks: reload (state is lost), wait for 2026, and go to the next step.
- Time left over: ask `Who was convicted for the Vastaamo data breach?` (cached since dry run 3,
  instant): a 2020 article; the slider jumps to its year, and the answer changed with the April 2024
  sentencing (Porvari, oldid=22360610). A truly new question takes ~25 s ("Preparing the answer from
  Wikipedia's history…", then "Translating answer into English…") and arrives by itself; only do it
  if there is time, and do not click while it runs.
- Language question from judges: click **Svenska**, the chip question shows "Maskinöversatt från
  engelska" and "Detta svar ändrades 3 gånger"; in Finnish ask `Miten talvisota päättyi?`
  ("Perustuu Wikipedia-artikkeleihin (suomi)", 2006–2010 "Muokannut Whiskey~fiwiki (7.11.2006)").

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

**Cross-language compare.** `GET /api/compare/fi/{page_id}` runs on request: for each Finnish section
it takes the closest chunk of the Swedish and English sibling (same `wikidata_id`) with
`VEC_DISTANCE_COSINE` between the two articles' chunks. A match needs distance ≤ 0.35. On 132
hand-labelled pairs that gives precision 0.908 and recall 0.747. Talvisota takes 17 ms.

**System versioning (SVT).** `wikihistory.article` is `WITH SYSTEM VERSIONING`. Its invisible
`row_start`/`row_end` columns hold the real Wikipedia edit times. We loaded dataset M (19,742
articles, 862,076 versions) with the organizers' loader, using `system_versioning_insert_history`.
- Through time and Ask read `FOR SYSTEM_TIME AS OF TIMESTAMP ?` (one snapshot per year). Timelines
  read `FOR SYSTEM_TIME ALL`.
- Precomputed tables: `history_stats` (versions, reverts, disputes, war months per article),
  `month_stats` (371,512 rows) and `global_month_stats` (285 rows). Rebuilding them took 79 s.
- `section_history`: section history and ghost sections for all 19,285 Finnish pages, built once
  from the yearly SVT snapshots, with no LLM. A summary reads it in under 1 ms.
- We merged `wikihistory` into the same server as `wikirag`. This lets **one SQL statement** join
  vector search with `FOR SYSTEM_TIME AS OF` (`SINGLE_STMT_HISTORY_SQL` in `backend/ask.py`).

**Caches in MariaDB.** `summary_cache` and `answer_cache` hold the LLM's JSON output. The default row
is built once; each UI language row is a translation of it, never a rebuild, so all languages show
the same milestones. Each translated row stores a `source_hash` of the default JSON; if the default
changes, the hash no longer matches and the row is translated again. A cache hit takes about 2–7 ms.

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

## Known limits

- Change detection uses numbers only. Edits that change only names or wording are missed.
- Compare recall is 0.747: about 1 in 4 real matches is missed (e.g. Talvisota *Joukot* vs Swedish
  *Styrkeförhållanden*, 0.381). Some matches are only cosmetic (the fi notes section "Huomautuksia"
  matches an English notes chunk), and a match can point to a weak passage (fi *Moskovan rauha* ->
  en *Foreign support*).
- History exists only for Finnish (dataset M). Swedish and English summaries show the **Finnish**
  edit history next to them. 12 listed articles were missing from the dumps.
- Some demo questions miss: 32, 34 and 39 retrieve the wrong top article, and [38] finds no answer at all.
- Hybrid search is measured but not used. Way B is a research table only.
- Short articles (under 1,500 words or fewer than 4 sections) get an overview without section cards.
- New (uncached) questions take about 25 s. Through Time "As of" takes about 2.5 s.

## Run

FastAPI serves the API and the built frontend (`dist/`) on `127.0.0.1:8002` on the VPS. Open it
through an SSH tunnel, for example `ssh -L 8002:127.0.0.1:8002 <vps>`, then go to
`http://localhost:8002`.
