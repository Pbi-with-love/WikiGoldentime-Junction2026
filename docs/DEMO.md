# wikimemory — demo notes for judges

## Pitch

wikimemory is a 3D galaxy of Finnish-history Wikipedia articles (fi, sv, en; 29,460 stars). You can
ask a question and get an answer with sources, and then see how Wikipedia's answer to that question
changed over the years, edit by edit, with the editor who made each change. It is built for **both
tracks**. RAG: MariaDB `VECTOR` search over 83,797 bge-m3 chunks finds the passages. SVT: a
system-versioned `wikihistory` table with 862,076 real revisions, read with
`FOR SYSTEM_TIME AS OF`, shows what the article said in each year. Every LLM output is grounded in
the text it was given and is cached in MariaDB, so the demo never waits for the model.

## Demo script (about 5 minutes)

Labels below are the real button names on the deployed build (checked in dry run 2, see
`docs/memory/research/demo-dryrun-2.md`). Start in the **English** UI (`English` button, top right).
**Before going on stage:** open the app, wait about 10 s for the intro sweep of the time slider to end
(clicks during the sweep can show the wrong year), and pre-run steps 3, 5 and 7 once.

1. **Galaxy (20 s).** Open the app. Say: "Each star is one article. Colour shows the language, and a
   red ring marks an article that had an edit war. Position comes from UMAP over the bge-m3 vectors."
   Drag to orbit, then move the time slider (2003–2026, "Edits per month"). *After spec 023 Part B is
   deployed:* the slider starts in 2001 and stars appear in the year their article was created.
   Click any star: four curved **memory threads** fly from it to its neighbours (similar article, the
   article before / after in time), and the article panel opens with its image and credit line
   ("Image: …, licence"; fi "Kuva:", sv "Bild:").
2. **Search (15 s).** Type `talvisota`, press **Search** ("20 matching articles"). Pick *Talvisota*
   (fi 1256; in the English UI it is the second row, after *Vinterkriget*). Say: "Search runs on
   MariaDB vector search. The 'also in' chips show the same article in the other languages" (Talvisota:
   `sv`, `en`).
3. **Ask, the hero question (60 s).** Type `How did the Winter War end?` (or the chip with the same
   text) and press **Ask** (cached, under 1 s). Say: "The answer cites its sources. Under it, 'This
   answer changed 3 times' is a timeline of 4 milestones: 2003–2004, 2005–2005, 2006–2020, 2021–2026."
   Point at the **2006–2020** card. Its face already shows
   **"Edited by Whiskey~fiwiki on 7 Nov 2006 oldid=1862876"** (the `oldid=2114325` under it is just the
   last edit of that period):
   - 2003: the peace treaty is signed on "13 March".
   - 2005: the article is rewritten (rev 590107, Kahkonen).
   - 2006: the text becomes "12 March … taking effect the next day", **changed by** rev 1862876, user
     Whiskey~fiwiki. We checked by hand that this is the one real date change. The 2004 flips and the
     removals in 2005–2010 were vandalism, reverted within 1–2 minutes.
   - 2021: Tridon1971 adds sources (rev 20199251); the answer now says "the evening of 12 March".
   Click the card: the answer as of that period, each fact with its Finnish source sentence, and the
   word diff against today. Click `oldid=1862876` to open that exact revision on Wikipedia. Say: "Each
   period's answer is built from `FOR SYSTEM_TIME AS OF` text, not from today's article." Point at
   **Memory threads from Talvisota** under the answer (real neighbours: Talvisodan tausta, Jatkosota,
   Välirauha, Suomen sota). Optional: switch to **Suomi** and ask `Miten talvisota päättyi?`. The same
   2006 edit appears ("Muokannut Whiskey~fiwiki (7.11.2006)"), with 2006–2010 and 2011–2026 periods.
   The en question gives the same milestones in the fi, sv and en UI.
4. **A new question, live (30 s, optional).** Ask something not cached, e.g. `When was Matti Haapoja
   born?`. The panel shows "Preparing the answer from Wikipedia's history…" with the closest passage
   at once, then "Translating answer into English…"; the answer arrives by itself after about 25 s.
   Say: "New questions are answered live from the retrieved text and then cached in MariaDB." Talk
   through the wait; do not click.
5. **Road (40 s).** Open *Talvisota* and click **See as a road** (or the **Talvitie: Talvisota** chip).
   Say: "13 stations around this article, 1808–1944, picked by vector similarity and shared Wikipedia
   categories." Each card shows why it is there ("Similar (77%)" or "shared category: …"), the real
   lead, and its history ("Added 2004 · changed 796 times · 127 reverts · 19 disputes"). Use
   **Next** / **Previous**, then **Back to the sky**. Another road: *Hallin Janne* (fi 375415), 13
   Finnish criminals 1800–2001. The three islands in the sky (Talvisota, Suomen sisällissota, Suomen
   suuriruhtinaskunta) open the same kind of road; the third one is built from a category.
6. **Summarize (45 s).** Switch the UI to **Suomi** first (the language buttons are hidden while a
   summary is open). Open *Talvisota*, click **Tiivistä** (Summarize). Say: "One card per section,
   13 in all. Each fact keeps its exact source sentence. The faded cards are **ghost sections**: 5
   sections that existed in the past and were later removed." Use **Seuraava** (Next) to reach
   "Osio 5 / 13" *Moskovan rauha* (the first three Next steps go through ghost cards). Point at
   "muokattu uudelleen 14 kertaa" (rewritten 14 times): the section's own edit history, precomputed
   in SQL.
7. **Cross-language compare (30 s).** On the same card: "Myös ruotsinkielisessä Wikipediassa" (Also in
   Swedish Wikipedia) with the matching Swedish passage, section *Fredsavtalet*. Point only at the
   Swedish passage (the English one below it, *Foreign support*, is a weak match). Say: "For each
   Finnish section we look for the closest Swedish and English passage with vector distance. A section
   with no close passage is marked 'Only in Finnish Wikipedia'." Then tell the treaty story from our
   research (an observation, not a verdict):
   - fi was corrected in 2006 (rev 1862876): signed "in the evening of 12 March", fighting ended the
     next day.
   - The sv and en **lead sentences** still put the end of the war / the treaty on 13 March 1940,
     while their own body text says the treaty was signed on 12 March.
   - All three agree on the facts in the body: signed 12 March, fighting ended 13 March at 11
     (Helsinki time). Only fi says "evening".
8. **Language (30 s).** Click **Takaisin taivaalle** (Back to the sky), switch to **Svenska**, open
   *Talvisota* and click **Sammanfatta**. Say: "In Swedish we show the **native** Swedish article,
   *Vinterkriget*, not a translation: 'Sammanfattning av artikeln i svenskspråkiga Wikipedia', 6
   avsnitt." Click **Nästa** 7 times to the card "Redigeringshistorik från finskspråkiga Wikipedia"
   (Edit history of Finnish Wikipedia): the Finnish section history ("omskriven 14 gånger" …). Then
   switch to **English**: the native *Winter War* ("Summary of the English Wikipedia article", 9
   sections, all in English; the history card is card 10). Say: "Native article first. Articles
   without a Swedish or English sibling get a translation of the Finnish summary, labelled
   'Machine-translated from Finnish Wikipedia'."
9. **Through time (40 s).** **Back to the sky**, open *Talvisota*, click the **Through Time** tab,
   then **As of 2006** (about 2 s to load). The card shows "2006 · Edited by Höyhens on 29 Dec 2006 ·
   oldid=2114325" and the article text as of that date. Scroll to **Word diff against today**. Say:
   "This is a plain `SELECT ... FOR SYSTEM_TIME AS OF` on the system-versioned table, and each version
   links back to Wikipedia's `?oldid=`."
10. **Edit wars (20 s).** Top of the same tab: "2,143 versions · 328 reverts · 88 disputes · 7
    edit-war months", and the monthly bars (hover one for "edits, disputes"). Say: "Across dataset M
    there are 45,668 reverts, 15,633 disputes and 890 edit-war months. All of it is precomputed in SQL
    tables, never computed per request."
11. **Geography (15 s).** Close the panel, click **Geography**: the stars move onto a map of Finland
    (Rovaniemi, Oulu, Vaasa, Tampere, Viipuri); stars without coordinates gather in "Unlocated
    articles". Say: "7,186 of the 29,460 stars have Wikidata coordinates." (Until spec 023 Part B is
    deployed, the south coast sits under the timeline bar; do not linger there.)
12. **Close (15 s).** Say: "In short: vectors find the passage, system versioning shows how it
    changed, and MariaDB stores all of it, including the LLM cache."

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
- An answer to an English question is labelled "Machine-translated from Finnish" even when it cites English
  sources. New (uncached) questions take about 25 s.

## Run

FastAPI serves the API and the built frontend (`dist/`) on `127.0.0.1:8002` on the VPS. Open it
through an SSH tunnel, for example `ssh -L 8002:127.0.0.1:8002 <vps>`, then go to
`http://localhost:8002`.
