# Demo dry run 2 — deployed build (2026-11-14, ~19:45 UTC)

Setup: SSH tunnel 18092 -> VPS 127.0.0.1:8002 (deployed `dist/`, bundle `index-BRnMhx_L.js` = 025 deploy),
`playwright-cli` session (Chromium, 1440×900), read-only. Screenshots: `artifacts/demo-dryrun-2/`.
Console: 0 errors, 0 warnings over the whole run. Failed requests: none (one `/api/stars` aborted by my
own page reload). Times are click -> result in the browser.

| # | Step | UI | Result | Labels / notes | Screenshot |
|---|---|---|---|---|---|
| 1 | Galaxy, slider | en | works | slider 2003–2026 (spec 023 Part B not deployed), "Edits per month" | 01-galaxy-en.png |
| 2 | Search `talvisota` | en | works, <0.5 s | "20 matching articles"; row 1 Vinterkriget, row 2 Talvisota "also in sv, en" | 02-search-talvisota-en.png |
| 3 | Article panel | en/fi/sv | works, 0.6–1.1 s | **Summarize / See as a road / Close**; caption "Image/Kuva/Bild: Unknown author., Public domain" | 03-talvisota-panel-en.png |
| 4 | Ask hero en | en | works, 2.0 s | "This answer changed 3 times": 2003–2004 / 2005–2005 / 2006–2020 / **2021–2026** (Tridon1971). Card face "Edited by Whiskey~fiwiki on 7 Nov 2006 oldid=1862876" without click | 04-ask-hero-en.png |
| 5 | 2006 card click | en | works, 0.1 s | facts with fi source sentence "illalla 12. maaliskuuta", "Word diff against today (oldid=23500447)" | 05-ask-milestone-2006-en.png |
| 6 | Ask hero fi / sv | fi, sv | works, 0.2 s | fi: "Tämä vastaus muuttui 3 kertaa", 2006–2010 "Muokannut Whiskey~fiwiki (7.11.2006)", 2011–2026 KLS. sv question: 5 periods, "Ändrad av Whiskey~fiwiki den 7 nov. 2006" | 13-ask-hero-fi.png, -sv.png |
| 7 | Memory threads under answer | en/fi/sv | works, real | Talvisodan tausta ≈91 %, Jatkosota 1941 →, Välirauha ≈84 %, Suomen sota ← 1808; no "[mock]" on page | 04-ask-hero-en.png |
| 8 | New question `When was Matti Haapoja born?` | en | works, **~25 s**, arrives by itself | "Preparing the answer from Wikipedia's history…" + closest passage at once, then "Translating answer into English…", then answer + "This answer has not changed since 2005". Answer says "Passage 3 also gives…" | 06-, 07-ask-new-*.png |
| 9 | Select star -> link lines | fi/sv/en | works | 5 stars via the select handler (Talvisota, Vinterkriget, Winter War, Hallin Janne, Lapland War) + 3 real canvas clicks: 4 threads each, lines drawn | 08-*.png |
| 10 | See as a road | fi/sv/en | works, 1.7 s | Talvisota 13 st. 1808–1944 "Similar (77%)", "Added 2004 · changed 796 times", "127 reverts · 19 disputes"; Hallin Janne 1800–2001 "shared category: Suomen suuriruhtinaskunnan rikoshistoria"; Vinterkriget, Lapland War 13 each | 09-road-*.png |
| 11 | 3rd sky island | en | works, 1.8 s | "Suomen suuriruhtinaskunta" -> `topic-road?category=…`, 13 st. 1748–1939, "Category: Suomen suuriruhtinaskunta" | 10-island-*.png |
| 12 | Summarize en | en | works | native Winter War, 9 sections, all English, no Citations; card 10 "Edit history of Finnish Wikipedia" | 11-, 12-summary-en-*.png |
| 13 | Summarize sv | sv | works | Vinterkriget "Sammanfattning av artikeln i svenskspråkiga Wikipedia", 6 avsnitt; card 7 "Redigeringshistorik från finskspråkiga Wikipedia" | 12-summary-sv-*.png |
| 14 | Tiivistä fi + compare | fi | works | 13 osiota · 35 min → 2 min, 5 ghosts; Moskovan rauha = "Osio 5 / 13" (8th Seuraava; 3 ghost cards come first), "muokattu uudelleen 14 kertaa"; sv Fredsavtalet good, en "Foreign support" off-topic | 12-summary-fi-card08.png |
| 15 | Through Time, As of 2006 | en/fi/sv | works, **~2 s** | "2006 Edited by Höyhens on 29 Dec 2006 oldid=2114325"; "2,143 versions 328 reverts 88 disputes 7 edit-war months"; fi "Ajan läpi / Tilanne 2006", sv "Genom tiden / Per år 2006" | 14-, 15-through-time-*.png |
| 16 | Geography lens | en | works, 3.5 s | real Finland map (Rovaniemi, Oulu, Vaasa, Tampere, Viipuri) + "Unlocated articles"; **south coast still under the timeline bar** | 16-geography-en.png |

## Bugs before the demo (most visible on stage first)

1. **DEMO.md hero milestones were stale** (fixed in DEMO.md now): en question now gives 2006–**2020** and
   2021–2026 (Tridon1971, rev 20199251), not 2006–2008 / 2009–2026. STATUS 025 says "hero milestones
   unchanged" — they changed (same in all 3 UIs, API checked).
2. **Moskovan rauha "Myös englanninkielisessä Wikipediassa" still off-topic** (Foreign support, Allied troops /
   iron ore) right on the treaty card. Presenter: point at the sv passage only.
3. **Geography: south of Finland under the timeline bar** ("Edits per month" text over Helsinki). Spec 023 B.
4. **English hero answer labelled "Machine-translated from Finnish"** though it cites en *Winter War*; new
   answers say "Machine-translated from Swedish, Finnish". Confusing for judges.
5. **New-question answer wording** "Passage 3 also gives 1845…" (LLM talks about passages). ~25 s wait.
6. **Clicks during the ~10 s intro sweep** of the slider: Through Time showed the 2003 card after "As of
   2006" and a "Loading…" pill stayed visible. Not reproduced after the intro. Wait before clicking.
7. **Language buttons hidden in the summary view** (B6, by design); presenter goes Back to the sky first.
8. Road/summary in sv/en mix Finnish text: sv road has fi stations (Talvisodan tausta, …); en/sv ghost
   cards and history rows show Finnish headings and archived text; road history stats are the fi article's.
9. Cosmetic: "Edit history of Finnish Wikipedia" printed twice on the history card (en and sv); real
   canvas click zooms so far in that the 4 thread lines leave the screen and neighbour labels are not shown.
10. Slow steps (> 1 s): new question ~25 s; Ask hero first click 2.0 s; As of 2006 ~2 s; road 1.7–1.8 s;
    Geography 3.5 s (animation); article open 1.1 s (fi) to 2–3 s via the select handler.

## First dry run bugs: status

- B1 en summary wrong language / Citations meta text: **fixed** (spec 020; 9 sections, all English).
- B3 search "also in" chips: **fixed** (spec 021; fi Talvisota shows sv, en).
- B4 changed_by hidden until click: **fixed** (spec 021; on the card face). The header oldid=2114325 still
  sits under it, but now second.
- Milestone click 1.3–2.4 s: **fixed** (0.1 s). sv/en Summarize 1.7–2.1 s: now fast (cached).
- B2 Moskovan rauha en passage off-topic: **open**. B6 language buttons hidden in summary: **open** (by design).
- Cosmetic history-card heading twice: **open**. fi notes "Huomautuksia" matching: **fixed** (020 dropped it).
