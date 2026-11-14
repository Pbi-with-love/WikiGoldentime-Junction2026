# Demo dry run 3 — deployed build (2026-11-14, ~20:20–20:32 UTC)

Setup: SSH tunnel 18122 -> VPS 127.0.0.1:8002, `playwright-cli` session (Chromium, 1280×720, one check
at 390×844), read-only. Screenshots: `artifacts/demo-dryrun-3/`. Console: 0 errors, 0 warnings. Failed
requests: none (all API calls 200). **Bundle changed during the run:** steps 1–9 ran on
`index-zLNeP6kO.js`; a worker deployed `index-BVyARc13.js` at 20:29:30 UTC (uncommitted 027/028 WIP on
disk), and my page reload for step 10 picked it up, so steps 10–17 ran on `BVyARc13`.

| # | Step | UI | Result | Labels / notes | Screenshot |
|---|---|---|---|---|---|
| 1 | Slider 2001–2026, star birth | en | works | Home=2001: 68 stars, "0 edits in 2001"; 2004: 2,037; 2010: 14,361; 2026: 29,460; dragging back hides them | 01–04 |
| 2 | Search recent article at 2001 | en | works, 0.3 s | `Vastaamo data breach` (created 2020): slider 2001 -> **2020** on open | 05 |
| 3 | Ask hero at 2001 | en | works, 0.25 s | slider auto-jumps 2001 -> 2003; "Based on English, Finnish Wikipedia" (no "Machine-translated"); "This answer changed 3 times" 2003–2004 / 2005–2005 / 2006–2020 / 2021–2026; card face "Edited by Whiskey~fiwiki on 7 Nov 2006 oldid=1862876" | 06 |
| 4 | 2006–2020 card click | en | works, **1.4 s** | facts with fi source "illalla 12. maaliskuuta"; "Word diff against today (oldid=23500447)"; `/api/diff` 0.93–1.05 s server, not cached | 07 |
| 5 | New question `Who was convicted for the Vastaamo data breach?` | en | works, ~25 s, arrives by itself | "Preparing the answer from Wikipedia's history…" + closest passage, then "Translating answer into English…" (~12 s later), answer ~15 s after that; **no "Passage N"**; "Based on English, Finnish Wikipedia"; 4 periods, 2024–2025 "Edited by Porvari on 30 Apr 2024". Now cached | 08 |
| 6 | Click a star at second 2 of the intro | en | works | sweep at 2014 -> jumps to **2026** at once; panel opened (Valhalla-seura), no "Loading…" left | 09 |
| 7 | Search `talvisota` + chips | en | works, 0.3 s | "20 matching articles"; Vinterkriget (fi, en), Talvisota (sv, en), Winter War (sv, fi) | 10 |
| 8 | Talvisota panel + image credit | en | works, ~2.7 s until credit | "Image: Unknown author., Public domain"; Summarize / See as a road / Close | 11 |
| 9 | See as a road | en | works, 0.4 s | "13 historical milestones · 1808–1944", "Similar (77%)", "Added 2004 · changed 796 times", "127 reverts · 19 disputes", "Image: Imonoz, CC BY-SA 4.0"; Next/Previous/Back to the sky OK | 12 |
| 10 | Through Time -> As of 2006 | en | works, **2.5 s** | "2,143 versions 328 reverts 88 disputes 7 edit-war months"; "2006 Edited by Höyhens on 29 Dec 2006 oldid=2114325"; slider moves to 2006. Tabs are role=tab, "As of" buttons are text buttons | 13 |
| 11 | Geography 1280×720 | en | works | whole map above the slider (Rovaniemi … Helsinki, Viipuri) + "Unlocated articles" | 14 |
| 12 | Geography 390 px | en | mostly works | south coast above the slider; map wider than the screen (east edge cut), top behind header, no city labels | 15 |
| 13 | Ask hero fi | fi | works, 0.33 s | "Perustuu Wikipedia-artikkeleihin (suomi)"; "Tämä vastaus muuttui 3 kertaa"; 2006–2010 "Muokannut Whiskey~fiwiki (7.11.2006)"; 2011–2026 KLS | 16 |
| 14 | Tiivistä + compare | fi | works, 0.15 s | "13 osiota · 35 min → 2 min"; Osio 5 / 13 Moskovan rauha after 8× Seuraava, "muokattu uudelleen 14 kertaa"; sv Fredsavtalet good; **en still "Foreign support"** | 17 |
| 15 | Ask en question in sv UI | sv | works | **"Maskinöversatt från engelska"**, "Detta svar ändrades 3 gånger", "Ändrad av Whiskey~fiwiki den 7 nov. 2006" | 18 |
| 16 | Sammanfatta + history card | sv/en | works | Vinterkriget "Sammanfattning av artikeln i svenskspråkiga Wikipedia", 6 avsnitt; history card heading once (plus the nav caption); en Winter War 9 sections, "Edit history of Finnish Wikipedia" once | 19, 20 |
| 17 | Language switch inside summary (028, BVyARc13) | en->sv | works | buttons visible in Summary Trail; Svenska re-renders Vinterkriget trail (lands on a ghost card, not card 1) | 21 |

## Remaining bugs (most visible on stage first)

1. **Compare en passage for Moskovan rauha is off-topic** ("Foreign support", iron ore) on the treaty
   card. Spec 027 in progress; until then point at the Swedish passage only.
2. **Hero en answer says "signed on 13 March 1940"** while the 2006 milestone story is "12 March". True to
   the en lead, but a judge may see a contradiction. Presenter line added to DEMO.md.
3. **Slow clicks:** Through Time "As of 2006" 2.5 s (`/api/asof` 0.8 s + diff ~1 s), 2006 card 1.4 s
   (`/api/diff` ~1 s, not cached), article panel to image credit ~2.7 s, new question ~25 s.
4. Geography at 390 px: map cut on the right and under the header, no city labels (1280 is fine).
5. Language switch in Summary (028 WIP) lands on a ghost card instead of keeping the position.
6. Cosmetic: at 2010 dense stars sit behind the "Edits per month" line; the timeline region's aria
   label still says "2003 to 2026"; en article panel shows Finnish category chips ("2020-luvun rikokset
   Suomessa"); search list stays open behind the article panel; card counter "13" on the 7th/10th card.
7. Thread lines leave the screen after a real star click (camera zooms close), as in dry run 2.

## Fixed since dry run 2

Slider 2001–2026 with star birth; search/Ask auto-jump; intro sweep stops at 2026 on first click (no
stuck "Loading…"); en answer label "Based on … Wikipedia"; sv shows the translated label; no "Passage N"
in new answers; geography above the slider at 1280; duplicate history heading gone; language buttons in
Summary Trail (BVyARc13 only).

## Presenter checklist (warm-up before going on stage)

- [ ] Tunnel up, app open at 1280×720 or larger, slider reads **2026** (wait 10 s or click once).
- [ ] Check the bundle hash in DevTools/`curl` matches the one the team last verified.
- [ ] Click chip **How did the Winter War end?** -> **2006–2020** card (warms the diff) -> Close.
- [ ] `talvisota` -> *Talvisota* -> **Through Time** -> **As of 2006** (warms AS OF) -> **See as a road** -> **Back to the sky**.
- [ ] **Suomi** -> *Talvisota* -> **Tiivistä** -> **Takaisin taivaalle** -> **English**.
- [ ] Reload, wait for 2026; keep a second tab in the same state as backup.
- [ ] Do not ask new questions in rehearsal that you plan to ask live (they become cached).
