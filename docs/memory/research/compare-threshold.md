# Spec 017 Cross-Language Section Compare — Calibration Report

## 1. Method & Dataset

- **Articles:** 23 non-short Finnish (`fi`) articles with both `sv` and `en` non-redirect siblings (`3` demo: `1256 Talvisota`, `1150 Jatkosota`, `440 Helsinki`; plus `20` deterministic random via `ORDER BY CRC32(fi.page_id)`).
- **Total Finnish sections (`>= 1` `fi` chunk):** 163 sections -> **326** sibling pairs (`163 sv` + `163 en`) and **326** mismatched random pairs.
- **Chunk/article revision check:** `chunk.rev_id == article.rev_id` passed with **0 mismatches** across all 23 articles and their `sv`/`en` siblings; `chunk` = `chunk_vector` = `83,797` rows.
- **Labelled blind ground-truth subset (`data/compare_labels.tsv`):** **132** pairs across **9** articles (`3` demo + `6` random: `18033, 1137, 10758, 191874, 7656, 118508`, all 66 sections × 2 languages): **79** positives (`label=1`) and **53** negatives (`label=0`). Labels were assigned blindly from Finnish and sibling Wikipedia article text before reading distances; `passage_ok` was judged after inspecting winning passages.

### Sample Articles (23)

| `fi.page_id` | Title | Sections | `sv.page_id` (`chunks`) | `en.page_id` (`chunks`) |
|---:|---|---:|---:|---:|
| 1256 | Talvisota *(demo)* | 14 | 23612 (15) | 33924 (75) |
| 1150 | Suomen sisällissota *(demo)* | 11 | 8414 (23) | 11772 (54) |
| 440 | Jatkosota *(demo)* | 6 | 13455 (21) | 7712 (39) |
| 1089 | Suuri Pohjan sota | 11 | 7092 (54) | 48757 (34) |
| 1137 | Sauli Niinistö | 7 | 119870 (5) | 1042690 (16) |
| 1333 | Viipuri | 5 | 3760 (13) | 21494997 (18) |
| 7656 | Tampereen yliopisto (1925–2018) | 5 | 306347 (1) | 606022 (7) |
| 10754 | Karjalan tasavalta | 8 | 148990 (1) | 199243 (42) |
| 10758 | Jääkäriliike | 11 | 489573 (3) | 254356 (6) |
| 10858 | Jyrki Katainen | 7 | 173701 (5) | 1039797 (10) |
| 16431 | Laatokka | 8 | 32023 (7) | 18189 (11) |
| 18033 | Suomen kaarti | 4 | 944615 (1) | 48922427 (23) |
| 24162 | Sammallahdenmäki | 7 | 42778 (1) | 7009798 (3) |
| 35075 | Mikko Alatalo | 5 | 4046191 (1) | 3754205 (3) |
| 70612 | Sääksmäki | 8 | 348351 (1) | 7028386 (3) |
| 86783 | Eläintarhanajot | 4 | 1431502 (6) | 14627159 (9) |
| 111250 | Liivinmaan sota | 6 | 695633 (1) | 1300500 (26) |
| 118508 | Gunnar Nordström | 4 | 375203 (3) | 2388915 (8) |
| 140555 | Kurjenrahkan kansallispuisto | 4 | 799533 (18) | 4474371 (1) |
| 141466 | Heikoin lenkki | 4 | 1513955 (1) | 55613386 (22) |
| 191874 | Rautaruukki (yritys) | 4 | 90830 (1) | 7063356 (1) |
| 286844 | Upplands Väsbyn kunta | 11 | 31414 (12) | 209437 (8) |
| 926229 | Juha Sipilä | 9 | 1654470 (1) | 36092552 (9) |

## 2. Cosine Distance Histogram: Sibling vs Random Baseline

| Distance Bin | Sibling (`n=326`) | Random (`n=326`) |
|---|---:|---:|
| `< 0.15` | 3 | 0 |
| `[0.15, 0.20)` | 11 | 0 |
| `[0.20, 0.25)` | 25 | 0 |
| `[0.25, 0.30)` | 58 | 0 |
| `[0.30, 0.35)` | 64 | 1 |
| `[0.35, 0.40)` | 72 | 13 |
| `[0.40, 0.45)` | 47 | 15 |
| `[0.45, 0.50)` | 28 | 16 |
| `[0.50, 0.55)` | 14 | 21 |
| `[0.55, 0.60)` | 2 | 34 |
| `[0.60, 0.65)` | 1 | 77 |
| `[0.65, 0.70)` | 1 | 86 |
| `>= 0.70` | 0 | 63 |

- Sibling median distance: **0.353** (min `0.045`, max `0.660`).
- Random median distance: **0.638** (min `0.322`, max `0.810`).

## 3. Precision / Recall Sweep (Labelled Subset `n=132`)

| Threshold | TP | FP | FN | TN | Precision | Recall | F1 | `sv` P / R | `en` P / R |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `0.200` | 5 | 0 | 74 | 53 | 1.000 | 0.063 | 0.119 | 1.000 / 0.030 | 1.000 / 0.087 |
| `0.225` | 10 | 0 | 69 | 53 | 1.000 | 0.127 | 0.225 | 1.000 / 0.091 | 1.000 / 0.152 |
| `0.250` | 16 | 0 | 63 | 53 | 1.000 | 0.203 | 0.337 | 1.000 / 0.182 | 1.000 / 0.217 |
| `0.275` | 27 | 1 | 52 | 52 | 0.964 | 0.342 | 0.505 | 1.000 / 0.333 | 0.941 / 0.348 |
| `0.300` | 34 | 4 | 45 | 49 | 0.895 | 0.430 | 0.581 | 0.875 / 0.424 | 0.909 / 0.435 |
| `0.325` | 44 | 4 | 35 | 49 | 0.917 | 0.557 | 0.693 | 0.895 / 0.515 | 0.931 / 0.587 |
| `0.350` **<- chosen** | 59 | 6 | 20 | 47 | 0.908 | 0.747 | 0.819 | 0.889 / 0.727 | 0.921 / 0.761 |
| `0.375` | 65 | 11 | 14 | 42 | 0.855 | 0.823 | 0.839 | 0.794 / 0.818 | 0.905 / 0.826 |
| `0.400` | 72 | 19 | 7 | 34 | 0.791 | 0.911 | 0.847 | 0.714 / 0.909 | 0.857 / 0.913 |
| `0.425` | 75 | 21 | 4 | 32 | 0.781 | 0.949 | 0.857 | 0.689 / 0.939 | 0.863 / 0.957 |
| `0.450` | 77 | 31 | 2 | 22 | 0.713 | 0.975 | 0.824 | 0.615 / 0.970 | 0.804 / 0.978 |
| `0.475` | 79 | 33 | 0 | 20 | 0.705 | 1.000 | 0.827 | 0.611 / 1.000 | 0.793 / 1.000 |
| `0.500` | 79 | 41 | 0 | 12 | 0.658 | 1.000 | 0.794 | 0.559 / 1.000 | 0.754 / 1.000 |
| `0.525` | 79 | 46 | 0 | 7 | 0.632 | 1.000 | 0.775 | 0.541 / 1.000 | 0.719 / 1.000 |
| `0.550` | 79 | 50 | 0 | 3 | 0.612 | 1.000 | 0.760 | 0.524 / 1.000 | 0.697 / 1.000 |
| `0.575` | 79 | 52 | 0 | 1 | 0.603 | 1.000 | 0.752 | 0.508 / 1.000 | 0.697 / 1.000 |
| `0.600` | 79 | 52 | 0 | 1 | 0.603 | 1.000 | 0.752 | 0.508 / 1.000 | 0.697 / 1.000 |

## 4. Chosen Threshold & Passage Quality

- **Chosen `THRESHOLD = 0.35`:** Highest threshold on the sweep grid (`0.200..0.600` step `0.025`) with overall precision `>= 0.90` (**P = 0.908**, **R = 0.747**, **F1 = 0.819**; `0.375` drops precision to `0.855`). Per-language performance is balanced (`sv`: P = 0.889 / R = 0.727; `en`: P = 0.921 / R = 0.761), and only 6/132 false positives occur at `<= 0.35` (`67/79 = 84.8%` `passage_ok` among all `label=1` pairs, rising to **`55/59 = 93.2%`** among true positives at `<= 0.350`).
- **Intro-chunk share at `<= 0.35`:** `23/162` (**14.2%**) of passing matches across all 23 articles point to `(intro)`. Many of these are genuine matches where a short `sv`/`en` sibling covers a Finnish section in its lead paragraph (for example `Helsinki` or `Oskar Merikanto` where `sv`/`en` has only 1–2 chunks total).
- **Sibling-length breakdown (`label=1` pairs):**

| Sibling chunk count | Label=1 pairs | Matched (`<= 0.35`) | Recall | `passage_ok` among matched |
|---|---:|---:|---:|---:|
| 1 chunk | 5 | 3 | 0.600 | 3/3 |
| 2-5 chunks | 9 | 7 | 0.778 | 6/7 |
| 6-20 chunks | 27 | 18 | 0.667 | 16/18 |
| >20 chunks | 38 | 31 | 0.816 | 30/31 |

## 5. Compute Decision (Criterion B) & Query Plan

- **`EXPLAIN` on VPS (`fi:1256` -> `sv:23612`):**
  - `f` (`chunk`): `type=ref`, `key=PRIMARY`, `key_len=12`, `rows=78`, `Using where`
  - `s` (`chunk`): `type=ref`, `key=PRIMARY`, `key_len=12`, `rows=148`, `Using where`
- **Warm wall-clock timings on VPS (5-run medians):**
  - `fi:1256 Talvisota`: **15.1 ms** (`[15.1, 14.8, 15.0, 15.6, 15.6]`)
  - `fi:1150 Jatkosota`: **18.7 ms** (`[18.1, 19.1, 18.1, 18.7, 19.1]`)
  - `fi:440 Helsinki`: **10.5 ms** (`[10.6, 10.4, 10.3, 10.5, 10.5]`)
  - Max over 20 random calibration articles: **11.8 ms** (`fi:1089`)
- **Decision:** Well below the `<= 300 ms` threshold (`<= 19 ms` warm median) -> **compute on request** in `GET /api/compare/{lang}/{page_id}` without a `section_match` cache table.

## 6. Criterion D — `Talvisota` (`fi:1256`) Inspection Table (`THRESHOLD = 0.35`)

| `#` | `fi` heading | `sv` dist & match? | `sv` winning section | `sv` passage preview (80 chars) | `en` dist & match? | `en` winning section | `en` passage preview (80 chars) |
|---:|---|---|---|---|---|---|---|
| 1 | Tausta | `0.273` (yes) | Kriget | Tidigt på morgonen den 30 november öppnade sovjetiskt artilleri eld följt av… | `0.262` (yes) | Background | the Soviets' image in Finland. Meanwhile, Finland was attempting to negotiate a… |
| 2 | Joukot | `0.381` (no) | Styrkeförhållanden | Sovjetunionen var Finland överlägset både till numerär, beväpning och… | `0.344` (yes) | Opposing forces | capital Helsinki. The force was later divided into the 7th and 13th… |
| 3 | Suomen torjuntavoitot joulu- ja tammikuussa | `0.386` (no) | Kriget | leddes av den finländske kommunisten Otto Ville Kuusinen som flytt till… | `0.389` (no) | Operations from December to January | a mistake in planning, the nearby Munasuo swamp had a 1-kilometre (0.62… |
| 4 | Puna-armeijan suurhyökkäys helmikuussa | `0.360` (no) | Styrkeförhållanden | Sovjetunionen var Finland överlägset både till numerär, beväpning och… | `0.328` (yes) | Soviet breakthrough in February | Army, now under Kirill Meretskov, would concentrate 75 per cent of its strength… |
| 5 | Moskovan rauha | `0.331` (yes) | Fredsavtalet | Den 7 mars 1940 anlände statsminister Ryti och en förhandlingsdelegation till… | `0.313` (yes) | Foreign support | help the Finns, but without a war with the Soviet Union. Because of the heavy… |
| 6 | Osapuolten heikkoudet ja vahvuudet | `0.382` (no) | Styrkeförhållanden | Sovjetunionen var Finland överlägset både till numerär, beväpning och… | `0.354` (no) | Opposing forces | ### Soviet military plan Before the war, Soviet leadership had expected total… |
| 7 | Talvisodan sotatalous Suomessa | `0.432` (no) | Kriget | i mars bygga en försvarslinje öster om Fredrikshamn. Den särskilt uppsatta… | `0.443` (no) | Opposing forces | also almost universally trained in basic survival techniques, such as skiing.… |
| 8 | Osapuolten tappiot | `0.326` (yes) | Övriga offer | Bland offren för kriget finns 10 000 Leningradbor som dog av svält under… | `0.264` (yes) | Aftermath and casualties | and wounded. More recent Russian estimates vary: in 1990, Mikhail Semiryaga… |
| 9 | Alueluovutukset ja väestön uudelleensijoitus | `0.452` (no) | Övriga offer | Bland offren för kriget finns 10 000 Leningradbor som dog av svält under… | `0.356` (no) | Soviet breakthrough in February | population, 422,000 to 450,000 Karelians, were evacuated and lost their homes.… |
| 10 | Ulkomaiden roolit ja apu | `0.310` (yes) | `<INTRO>` | Vinterkriget (finska: talvisota), i Sverige även finska vinterkriget (ryska:… | `0.263` (yes) | Foreign support | This demand was sent to Norway and Sweden on 6 January, but it was likewise… |
| 11 | Talvisodan seurauksista ja merkityksestä | `0.367` (no) | `<INTRO>` | Vinterkriget (finska: talvisota), i Sverige även finska vinterkriget (ryska:… | `0.319` (yes) | Aftermath and casualties | invasion of the Soviet Union, possibly to expand its borders, especially into… |
| 12 | Kunniamerkit | `0.495` (no) | `<INTRO>` | Vinterkriget (finska: talvisota), i Sverige även finska vinterkriget (ryska:… | `0.499` (no) | General and cited references | (in Russian). Petrozavodsk: Karelia. ISBN 5754507356. - Juutilainen, Antti;… |
| 13 | Talvisota taiteessa ja viihteessä | `0.476` (no) | `<INTRO>` | Vinterkriget (finska: talvisota), i Sverige även finska vinterkriget (ryska:… | `0.460` (no) | General and cited references | the original on 2 December 2022. Retrieved 2 September 2009. - Baryshnikov, N.;… |
| 14 | Huomautuksia | `0.377` (no) | Styrkeförhållanden | Sovjetunionen var Finland överlägset både till numerär, beväpning och… | `0.277` (yes) | Explanatory notes | 1. ↑ At the beginning of the war, the Finns had 300,000 soldiers. The Finnish… |

Check on expected gaps: Section 7 (`Talvisodan sotatalous Suomessa`) has `sv = 0.432 (no)` and `en = 0.443 (no)` (`only fi`); Section 12 (`Kunniamerkit`) has `sv = 0.495 (no)` and `en = 0.499 (no)` (`only fi`); Section 13 (`Talvisota taiteessa ja viihteessä`) has `sv = 0.476 (no)` and `en = 0.460 (no)` (`only fi`).
