# Demo dry run 4 — deployed build (2026-11-14, ~21:25–21:50 UTC)

Setup: SSH tunnel 18400 -> VPS 127.0.0.1:8002, `playwright-cli` session (Chromium 1280×720; geography also at
390×844), read-only. **Bundle tested: `index-BKdWSYhL.js`** (curl on `/` confirmed at start and end; it did
not change during the run). Specs 027–031 deployed. Screenshots: `artifacts/demo-dryrun-4/`.
Console: 0 errors, 0 warnings. Failed requests: none (all API calls 200).
Timings are in-page (click -> expected text) unless noted; the tunnel adds ~100–150 ms per request.
A new question (25 s) was not repeated.

## Open items from dry run 3

| # | Item | Verdict | Evidence | Screenshot |
|---|---|---|---|---|
| 1 | 027: fi *Moskovan rauha* vs en passage | **fixed** | Osio 5 / 13 *Moskovan rauha*: sv *Fredsavtalet*, en section **"Soviet breakthrough in February"** (text: Feb 1940 offensive, Finland near exhaustion, cabinet hesitated). Not "Foreign support". The en excerpt starts mid-sentence ("its role as a buffer…") but is on-topic | 08 |
| 2 | 029: slow clicks | **mostly fixed, still intermittent** | see timing table below | – |
| 3 | 030: geography 390×844 | **fixed** | whole map visible, 7 city labels readable, "Unlocated articles" circle visible, map starts below the chips (nothing under the header), timeline bar clear. 1280×720 still fine | 13, 14 |
| 4 | 031: language switch in Summary Trail | **fixed** | fi *Moskovan rauha* (Osio 5/13) -> Svenska reopens on **Fredsavtalet (Avsnitt 4 av 6)** -> English reopens on **Section 7 of 9 "Soviet breakthrough in February"**. No ghost card. See caveat in bug 3 | 09a–c |
| 5 | en hero says 13 March | **still true, presenter line still needed** | en answer: "signed on 13 March 1940 … Hostilities ceased on 13 March 1940". The summary trail says 12 March (fi and en), the 2006 card says "signed the evening of 12 March, fighting ended the next day". DEMO.md step 2 note kept | 03 |

### 029 timings (ms, click -> content, warm server since earlier clicks in this session)

| Click | Measured | Note |
|---|---|---|
| Talvisota panel -> image credit | 176 (first after reload) | `/api/article` ~100 ms |
| 2006–2020 card -> Word diff | 624, 1946, 391 (three fresh reloads) | `/api/diff` 40–200 ms normally, but 1.5 s seen once on curl and 0.8 s once in the browser |
| Through Time tab | 23 | |
| As of 2006 | 143 / 1694 / 2593 / 179 | `/api/asof` TTFB 70 ms or 1.5–2.4 s, same URL, no pattern |
| As of 2012 | 169 / 211 / 1355 | same pattern |
| chip Talvitie: Talvisota | 297 | |
| hero chip (en) | 1384 first time, 267 (fi), 123 (sv) | |
| `curl` `/api/asof/1256?at=2006-12-31`, 14 calls | 0.13–0.26 s, one 0.83 s after an 8 s gap | uncached years 2007–2010: 0.26–0.74 s |

So warm is usually 100–300 ms, well under 500 ms, but about one click in three on As of / the 2006 card takes
0.6–2.6 s (server side, TTFB; VPS load average was 0.01, so it is not CPU). Another worker's E2E run may
have contributed. Cold server cache could not be measured: earlier runs had warmed it.

## Demo steps

| # | Step | UI | Result | Labels / notes | Screenshot |
|---|---|---|---|---|---|
| 1 | Slider 2001–2026 | en | works | Home -> 2001 "0 edits in 2001" (few stars), End -> 2026 "17,628 edits in 2026 · 10 edit-war months" | 01, 02 |
| 2 | Ask hero (chip) | en | works, 1.4 s | "Based on English, Finnish Wikipedia"; "This answer changed 3 times": 2003–2004 / 2005–2005 / 2006–2020 / 2021–2026; sources Winter War, The Winter War (film), Talvisota; threads panel unchanged | 03 |
| 3 | 2006–2020 card | en | works, 0.4–1.9 s | "Word diff against today (oldid=23500447)"; card shows "Edited by Whiskey~fiwiki on 7 Nov 2006 oldid=1862876" | 04 |
| 4 | Threads and road | en | works, 0.3 s | "13 historical milestones · 1808–1944", "Milestone 1 of 13 · 1808", "Similar (77%)", "Added 2004 · changed 796 times", "127 reverts · 19 disputes", "Image: Imonoz, CC BY-SA 4.0"; Next, Back to the sky OK (slider 2026) | 12 |
| 5 | fi: search `talvisota` + Tiivistä | fi | works | "20 vastaavaa artikkelia"; "13 osiota · 35 min → 2 min"; faded "Osio poistettu 2010" cards at the start; Osio 5 / 13 Moskovan rauha, "muokattu uudelleen 14 kertaa" after 8× Seuraava | 05–08 |
| 6 | Compare passages | fi | works | sv *Fredsavtalet*, en *Soviet breakthrough in February* (item 1) | 08 |
| 7 | Language switch in trail | fi->sv->en | works, but slow | click Svenska: the whole galaxy reloads (blank page with "Laddar…" for ~4–10 s, slider back at 2001), then the trail reopens on Fredsavtalet (Avsnitt 4 av 6); English: ~5 s, Section 7 of 9 | 09a–c |
| 8 | Through Time + As of 2006 | en | works, usually fast | "2,143 versions 328 reverts 88 disputes 7 edit-war months"; "As of 2012" card "Edited by Jtaramaa on 19 Dec 2012 oldid=12468838"; slider moves to 2006 (galaxy turns red/orange) | 10, 11 |
| 9 | Geography 1280×720 | en | works | Rovaniemi, Oulu, Suomussalmi, Vaasa, Tampere, Turku, Helsinki, Viipuri + "Unlocated articles" circle, all above the slider | 13 |
| 10 | Geography 390×844 | en | works | see item 3 | 14 |
| 11 | Ask hero fi | fi | works, 0.27 s | "Perustuu Wikipedia-artikkeleihin (suomi)"; "Tämä vastaus muuttui 3 kertaa": 2003–2004 / 2005 / 2006–2010 (Muokannut Whiskey~fiwiki (7.11.2006)) / 2011–2026 (KLS) | 15 |
| 12 | Ask hero sv (native chip) | sv | works, 0.12 s | **"Baserat på Wikipedia (engelska, svenska, finska)"** (no "Maskinöversatt"), **"Detta svar ändrades 4 gånger"**: 2003–2004 / 2005 / 2006–2008 / 2009–2025 (Peltimikko, 6 dec 2009) / 2026–2026 (Jesper Vire, 9 sep 2026); answer says "13 mars 1940" | 15 |

## Remaining bugs (most visible on stage first)

1. **Intermittent slow As of / 2006 card:** `/api/asof` and sometimes `/api/diff` take 1.3–2.6 s on repeated
   identical requests (TTFB, server side), while usually 70–200 ms. One click in about three. Presenter: keep
   talking, never double-click (DEMO.md backups already say this). Needs a look at the asof cache (key/TTL or
   an eviction), not a frontend fix.
2. **en hero says "13 March 1940"** (twice) while the 2006 card and the summary trail say 12 March. Presenter
   line in DEMO.md step 2 is still needed; nothing changed.
3. **Language switch in the trail reloads the whole app** (global switch re-fetches `/api/stars`): blank page
   with "Loading…" for ~4–10 s, slider back at 2001, then the trail reopens in the right section. Correct now,
   but dead air on stage. Do it only as the optional
   extra, and talk over the pause. The open question behind it: the language buttons in the trail are the
   global switcher.
4. **Language counts differ:** sv hero says "ändrades 4 gånger" with a 2026–2026 period (Jesper Vire, 9 Sep
   2026), while en and fi say 3. It is a native sv answer, but a judge flipping languages sees 3 -> 4. The
   old line "Maskinöversatt … 3 gånger" in DEMO.md was removed.
5. **Geography 390 px, small:** the legend ("Finnish Swedish English Edit war") and "Edits per month" sit on
   the south end of the map (Helsinki/Viipuri stars), and the east edge touches the screen border. Readable;
   cosmetic.
6. Carried over, unchanged and cosmetic: aria label "2003 to 2026" on the timeline region (slider runs
   2001–2026); en article panel under search shows the Finnish article/categories; search list stays open
   behind the article panel (screenshot 10/11); "Vinterkriget (film)" star label overlaps the "Moskovan
   rauhansopimus" chip at 1280×720 (screenshot 03, 11); thread lines leave the screen after a real star click.
7. Housekeeping: `package-lock.json` shows an uncommitted diff in this worktree (not from this run; left alone).

## Fixed since dry run 3

027 (en passage for Moskovan rauha), 030 (geography at 390 px), 031 (language switch keeps the section, no ghost
card), image credit and Talvisota panel fast (176 ms), hero and chips fast in all three languages.
