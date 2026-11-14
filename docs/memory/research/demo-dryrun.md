# Demo dry run — DEMO.md script on the live API (2026-11-14)

Setup: SSH tunnel 18012 -> VPS 127.0.0.1:8002 (live API), local vite on 5180 (temporary config in the
scratchpad, proxy /api -> 18012), `playwright-cli`, 1440×900. Read-only. Frontend = working tree, which
includes the uncommitted 019 Part B edits (image credit line under the panel photo).
Screenshots: `artifacts/demo-dryrun/`. Console: 0 errors, 0 warnings over the whole run; no failed requests.
Times are click -> network idle in the browser. API times (curl through the tunnel): ask 0.09–0.12 s, summary
0.14–0.38 s, compare 0.10 s, search 0.27 s.

| # | Step | UI | Result | Labels / notes | Screenshot |
|---|---|---|---|---|---|
| 1 | Galaxy | en | works | "Edits per month", slider 2003–2026; default UI = English | 01-galaxy-en.png |
| 2 | Search `talvisota` | en | works, 0.36 s | **Search**; "20 matching articles"; chips "also in". Bug B3 | 02-search-talvisota-en.png |
| 3 | Open Talvisota | en | works | **Summarize / See as a road / Close**; tabs **Today / Through Time** | 03-article-panel-en.png |
| 4 | Ask hero (en) | en | works, 0.83 s | **Ask**; "This answer changed 3 times", 4 milestones 2003–04 / 2005 / 2006–08 / 2009–26; label "Machine-translated from Finnish" | 04-ask-hero-en.png |
| 5 | 2006 milestone, changed_by | en | works, **2.4 s** (diff load) | "Edited by Whiskey~fiwiki on 7 Nov 2006 oldid=1862876" only after clicking the node. See B4 | 05-ask-milestone-2006-en.png |
| 6 | Ask `Miten talvisota päättyi?` | fi | works, 0.41 s; node click 1.3 s | "Tämä vastaus muuttui 3 kertaa", 2006–2010 then 2011–2026; "Muokannut Whiskey~fiwiki (7.11.2006) oldid=1862876" | 06-ask-hero-fi.png |
| 6b | Ask en question | sv, fi | works, 0.83 / 0.38 s | same 4 milestones as en; "Detta svar ändrades 3 gånger", "Ändrad av Whiskey~fiwiki den 7 nov. 2006" | 17-ask-hero-en-question-*.png |
| 7 | Summarize Talvisota | fi | works, 0.55 s | **Tiivistä**; "14 osiota · 35 min → 2 min"; 5 ghosts ("Osio poistettu 2010", "Poistettu 2007: …"); **Edellinen / Seuraava**, **Takaisin taivaalle** | 07-summarize-fi.png |
| 8 | Section card + compare | fi | works | Joukot: "muokattu uudelleen 4 kertaa", only "Myös englanninkielisessä Wikipediassa" (sv miss, known recall limit) | 08-summary-section-joukot-fi.png |
| 9 | Moskovan rauha compare | fi | works, but en match is weak | "Myös ruotsinkielisessä Wikipediassa" -> Osio: Fredsavtalet (good); en -> "Foreign support" passage about Allied troops (B5) | 09-summary-moskovan-rauha-fi.png |
| 10 | "Lue lisää" (read more) | fi | works, 0.6 s | shows original fi text, "Piilota alkuperäinen teksti" | 10-summary-section-readmore-fi.png |
| 11 | Language switch -> sv, Summarize | sv | works, **2.1 s** | native Vinterkriget, "Sammanfattning av artikeln i svenskspråkiga Wikipedia", 6 avsnitt; language buttons hidden while a summary is open (B6) | 11-summarize-sv-native.png |
| 12 | Finnish history card | sv | works | card 8: "Redigeringshistorik från finskspråkiga Wikipedia" (shown twice on the card), 14 rows "omskriven N gånger" + dots "Även i …/Bara i finskspråkiga Wikipedia" (tooltips only) | 12-sv-fi-history-card.png |
| 13 | Language switch -> en, Summarize | en | **broken content**, 1.7 s | native Winter War, "Summary of the English Wikipedia article", 12 sections; section 2 and 12 gists in Finnish, section 11 gist is LLM meta-text (B1) | 13-summarize-en-native.png |
| 14 | Through Time, As of 2006 | en | works, tab 0.96 s | **Through Time**, **As of 2006 / As of 2012 / As of Today**; "2006 Edited by Höyhens on 29 Dec 2006 oldid=2114325" | 14-through-time-asof-2006-en.png |
| 15 | Word diff | en | works | "Word diff against today", "today oldid=23500447"; 550 ins / 284 del spans | 15-diff-2006-vs-today-en.png |
| 16 | Edit-war stats | en | works | "2,143 versions 328 reverts 88 disputes 7 edit-war months"; monthly bars, tooltip "YYYY-MM: N edits, M disputes" | 16-edit-war-stats-en.png |
| 17 | Through Time labels | sv, fi | works | sv "Genom tiden", "Per år 2006", "Ordjämförelse mot idag"; fi "Ajan läpi", "Tilanne 2006", "Sanavertailu nykypäivään" | 18-through-time-*.png |
| 18 | Translated fallback 966363 | sv, en | works (API only) | variant=translated, out_lang sv/en, 0.14–0.18 s | — |

## Bugs to fix before the demo (most visible on stage first)

1. **B1 en summary of Winter War has wrong-language and meta text.** `/api/summary/fi/1256?ui=en`
   (native en 33924): section 2 "Opposing forces" and 12 "General and cited references" gists are in
   Finnish; section 11 "Citations" says "The user message consists solely of a numbered citation list…".
   Card 2 is visible right behind the Overview. Fix: skip reference sections (Citations, Explanatory notes,
   References) and force/validate output language, then rebuild that summary_cache row.
2. **B2 Moskovan rauha "Also in English" shows an off-topic passage** (Allied troops / Swedish ore, section
   "Foreign support", 0.313). Exactly the card we present for the treaty story. Demo the sv match; or pick
   the en chunk containing "Moscow Peace Treaty" if a tie-break exists.
3. **B4 two oldids on the 2006 milestone.** Header "Version 2006–2008 by Höyhens oldid=2114325" with an
   unrelated comment ("Talvisodan tausta … Neuvostoliitto/Venäjä?") sits above the real edit line
   "Edited by Whiskey~fiwiki … oldid=1862876", and changed_by is not visible until the node is clicked.
   Suggest showing changed_by user on the node and putting the changed_by line first.
4. **B3 search "also in" chips are wrong for non-first rows.** `also[wikidata_id]` is built relative to the
   first row's language, so fi *Talvisota* shows "also in en, fi" (itself, and sv missing); en *Winter War*
   also "en, fi". Fix in the API (exclude the row's own lang) or in `renderSearchResults`.
5. **B6 language buttons are hidden in the summary view.** Presenter must go "Back to the sky" first.
   DEMO.md now says so; a switch inside the summary would be smoother.
6. **Slow steps (> 1 s):** milestone click 1.3–2.4 s (diff fetch), sv/en Summarize 1.7–2.1 s (first open,
   fi_history + compare), Through Time tab ~1 s. Pre-click once before going on stage.
7. Cosmetic: "Redigeringshistorik från finskspråkiga Wikipedia" printed twice on the history card; fi UI
   Ask facts repeat the same sentence as claim and source; "Huomautuksia" (notes) matches en notes.
