# Hero question "How did the Winter War end?" — treaty date in fi / sv / en (current text)

Source: wikirag.article / chunk / chunk_vector on the VPS (read-only), 2026-11-14. Same wikidata Q134949.

| lang | page_id | rev_id | title | url | date_modified |
|---|---|---|---|---|---|
| fi | 1256 | 23500447 | Talvisota | https://fi.wikipedia.org/wiki/Talvisota | 2025-08-18 |
| sv | 23612 | 57814003 | Vinterkriget | https://sv.wikipedia.org/wiki/Vinterkriget | 2025-07-29 |
| en | 33924 | 1303580599 | Winter War | https://en.wikipedia.org/wiki/Winter_War | 2025-07-31 |

## Verbatim passages
**fi** (section "Moskovan rauha", chunk 22): "Suomen hallitus ja ulkoasiainvaliokunta hyväksyivät Neuvostoliiton laatiman
rauhansopimuksen 11. maaliskuuta ja Moskovan rauhansopimus allekirjoitettiin illalla 12. maaliskuuta 1940.
Taistelutoiminta rintamilla päättyi seuraavana päivänä asteittain klo 11 alkaen. Kello 10:45 neuvostojoukkojen
tykistö ja kranaatinheittimistö avasivat yllättäen tulen suomalaisten asemiin." Lead (chunk 0): "Talvisota oli
30. marraskuuta 1939 – 13. maaliskuuta 1940 ... sota päättyi 105 päivää myöhemmin Moskovan rauhansopimukseen."

**sv** (section "Fredsavtalet", chunk 12): "Fredsavtalet skrevs under den 12 mars och striderna upphörde den 13 mars
klockan 11.00." Lead (chunk 0): "Efter hårt och envist motstånd tvingades Finland den 13 mars 1940 gå med på fred
och göra landavträdelser (10 procent av sin yta), bland annat Karelska näset." Also: "Moskvafreden visade sig heller inte ..."

**en** (section "### Moscow Peace Treaty", inside "## Soviet breakthrough in February", chunk 43): "The Moscow Peace
Treaty was signed in Moscow on 12 March 1940. A cease-fire took effect the next day at noon Leningrad time, 11 a.m.
Helsinki time." Lead (chunk 0): "...and ended three and a half months later with the Moscow Peace Treaty on
13 March 1940." Lead para 2: "Hostilities ceased in March 1940 with the signing of the Moscow Peace Treaty..."
Also: "The end of the war on 13 March cancelled Franco-British plans..."

## Comparison
| | fi | sv | en |
|---|---|---|---|
| Signed date | 12 March 1940 | 12 March (year implied) | 12 March 1940, in Moscow |
| Time of day signed | evening ("illalla") | not stated | not stated |
| Ceasefire / end | 13 March, gradually from 11 ("asteittain klo 11 alkaen") | 13 March 11.00 | next day (13 March) at noon Leningrad = 11 a.m. Helsinki |
| Timezone wording | none | none | Leningrad and Helsinki time |
| Lead sentence date | war 30.11.1939 – 13.3.1940, ended with treaty | Finland "agreed to peace" 13 March 1940 | ended "with the Moscow Peace Treaty on 13 March 1940" |
| Extra detail | Soviet artillery barrage 10:45; Salla bombing at 12 | — | Kallio "Let the hand wither..." quote |

Agreements: all three say signed 12 March, fighting ended 13 March at 11 (local Finnish time).
Differences: only fi says "evening"; only en names a timezone (noon Leningrad = 11 Helsinki), so sv/fi "11"
matches en's Helsinki time. Correction to the brief: the fi article does NOT say "Leningrad time"; it says only
"klo 11". sv and en leads put the treaty on 13 March (en: "ended ... with the Moscow Peace Treaty on 13 March
1940"), which reads as if the treaty dates from 13 March, while their own body text says signed 12 March.
fi uniquely says the end was gradual ("asteittain") and describes the 10:45 barrage.

## Vector search (1 embedding of the English question, bge-m3, only these 3 articles, cosine distance)
| lang | top chunk (d) | treaty-date chunk rank (d) |
|---|---|---|
| en | 0 lead (0.328) — contains "13 March 1940", no signing date | chunk 43: rank 8 (0.395) |
| sv | 0 lead (0.420) — contains "den 13 mars 1940", no signing date | chunk 12: rank 6 (0.488) |
| fi | 0 lead (0.407) — "13. maaliskuuta 1940", no signing date | chunk 22: rank 4 (0.495) |
So the top passage in every language gives only "ended 13 March 1940"; the 12 March / evening / 11:00 detail is
retrieved only if the answer uses >= 4 (fi), 6 (sv), 8 (en) chunks of that article. Ranking was per article,
not the global search over all articles, so global ranks may differ.
