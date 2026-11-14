# Way B Spike: System-Versioned Vector Search (`wikirag.chunk_vector_hist`)

Research spike evaluating whether querying a system-versioned MariaDB vector table (`wikirag.chunk_vector_hist`) populated from precomputed `wikirag.snapshot_chunk_vector` snapshots improves historical retrieval over Way A (`chunk_vector` current search + `wikihistory.article FOR SYSTEM_TIME AS OF`).

The spike table `wikirag.chunk_vector_hist` remains on the VPS (`199.6` MB total: `153.0` MB data, `46.6` MB index) for inspection.

## What we found

* **Index support verdict:** **the vector index works on a system-versioned table (and is used under `FOR SYSTEM_TIME`, but post-filtered: results go missing).**
  * Both `CREATE TABLE ... VECTOR INDEX (embedding) M=16 DISTANCE=cosine ... WITH SYSTEM VERSIONING` (`INDEX_CREATE_OK`) and `ALTER TABLE chunk_vector_hist DROP KEY embedding; ALTER TABLE chunk_vector_hist ADD VECTOR INDEX (embedding) M=16 DISTANCE=cosine` succeed on MariaDB `12.3.3-MariaDB-ubu2404`.
  * `SHOW CREATE TABLE` records `PRIMARY KEY (lang, page_id, chunk_no, row_end)`, `VECTOR KEY embedding (embedding) M='16' DISTANCE='cosine'`, `PERIOD FOR SYSTEM_TIME (row_start, row_end)`, and `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci WITH SYSTEM VERSIONING`.
* **Zero-embedding history population works cleanly at small scale:** Using `SET time_zone = '+00:00'` and `SET system_versioning_insert_history = 1` (`@@global.secure_timestamp = NO`), [scripts/wayb_build.py](file:///Users/camlynh/Documents/Anh_Tai/temp/setup-template/WikiGoldentime/scripts/wayb_build.py) builds contiguous non-overlapping `[row_start, row_end)` intervals per page from `wikirag.snapshot_chunk_vector` with zero Ollama/embedding calls.
  * **1-article stage (`page_id = 1256`, Talvisota):** `24` snapshots -> `839` rows (`50` current, `789` history) built in `0.395 s` (`11.0` MB). `FOR SYSTEM_TIME AS OF '2015-01-01 00:00:00'` returns `(year=2014, rev_id=14547217, chunks=37)`, matching `snapshot_chunk_vector` (`sha1=fxkp5xcqcbtgozxyrg49jv9ipfvu80s`).
  * **50-article stage (`--all-history --rebuild`):** `50` pages / `926` snapshots -> `17,791` rows (`1,341` current, `16,450` history) built in `16.728 s` (`199.6` MB total: `153.0` MB data, `46.6` MB index).
* **Query execution uses the HNSW index under `AS OF`, but post-filters `row_start`/`row_end`:**
  * On all 3 test questions (`AS OF '2015-01-01 00:00:00'`, `mhnsw_ef_search=80`, `LIMIT 10`, `warmup=2`, `runs=10`), variant `(b)` (`FOR SYSTEM_TIME AS OF`) reports `access_type=index`, `key=embedding`, with `attached_condition`: `chunk_vector_hist.row_end > TIMESTAMP/*WITH LOCAL TIME ZONE*/'2015-01-01 00:00:00' and chunk_vector_hist.row_start <= TIMESTAMP/*WITH LOCAL TIME ZONE*/'2015-01-01 00:00:00'`.
  * Variant `(c)` (`IGNORE INDEX (embedding)`) forces `access_type=ALL` across all `17,791` rows (`1267.9–1576.0 ms` median vs `9.5–13.1 ms` median with the index).
  * Because all `17,791` rows live in one HNSW graph and only `772` rows (`4.34%` — `r_filtered=4.339%` on full scan) are live `AS OF '2015-01-01 00:00:00'`, post-filtering causes **30–50% top-10 recall loss**:

| Question (exp_page) | Variant | Plan (`type` / `key`) | Examined (`r_rows`) | Filtered (`r_filtered`) | Returned | Median (ms) | p90 (ms) | `overlap@10` (`b` vs `c`) | Missed true top-10 chunks by index |
|---|---|---|---:|---:|---:|---:|---:|---:|---|
| Q1 `Miten talvisota päättyi?` (`1256`) | `a_current` | `index` / `embedding` | `182` | `5.49%` | `10` | `9.025` | `11.867` | — | — |
| Q1 `Miten talvisota päättyi?` (`1256`) | `b_asof` | `index` / `embedding` | `207` | `4.83%` | `10` | `11.492` | `12.409` | `7/10` (`70.0%`, order differs) | `(1150, 51, 'Sodan päätös', d=0.4175)`, `(1150, 52, 'Sodan seuraukset', d=0.4192)`, `(1150, 55, 'Ratkaisu Saksassa', d=0.4194)` |
| Q1 `Miten talvisota päättyi?` (`1256`) | `c_asof_scan` | `ALL` / `None` | `17,791` | `4.34%` | `10` | `1576.009` | `1659.900` | — | exact ground truth |
| Q2 `How did the Winter War end?` (`1256`) | `a_current` | `index` / `embedding` | `176` | `5.68%` | `10` | `10.872` | `13.052` | — | — |
| Q2 `How did the Winter War end?` (`1256`) | `b_asof` | `index` / `embedding` | `278` | `3.60%` | `10` | `13.055` | `13.806` | `5/10` (`50.0%`, order differs) | `(1150, 51, 'Sodan päätös', d=0.4273)`, `(1150, 52, 'Sodan seuraukset', d=0.4539)`, `(1150, 55, 'Ratkaisu Saksassa', d=0.464)`, `(10758, 22, 'Jääkäriliikkeeseen olennaisesti nivoutuvaa maailmanhistoriaa lyhyesti', d=0.481)`, `(6816, 0, None, d=0.4825)` |
| Q2 `How did the Winter War end?` (`1256`) | `c_asof_scan` | `ALL` / `None` | `17,791` | `4.34%` | `10` | `1408.293` | `1526.589` | — | exact ground truth |
| Q3 `Who was the president of Finland from 1956 to 1982?` (`1275`) | `a_current` | `index` / `embedding` | `106` | `9.43%` | `10` | `2.719` | `2.796` | — | — |
| Q3 `Who was the president of Finland from 1956 to 1982?` (`1275`) | `b_asof` | `index` / `embedding` | `195` | `5.13%` | `10` | `9.495` | `9.808` | `7/10` (`70.0%`, order differs) | `(1275, 8, '1956–1962: Ensimmäinen kausi', d=0.5388)`, `(11446, 10, 'Presidentti', d=0.5611)`, `(11446, 0, None, d=0.5768)` |
| Q3 `Who was the president of Finland from 1956 to 1982?` (`1275`) | `c_asof_scan` | `ALL` / `None` | `17,791` | `4.34%` | `10` | `1267.872` | `1321.222` | — | exact ground truth |

* **Earlier timestamps amplify post-filtering stress:** In an extra run at `AS OF '2006-01-01 00:00:00'` (~`1.085%` of `17,791` rows live per `c_asof_scan` `r_filtered=1.0848%`), Q2 `b_asof` examined `407` nodes (`median=18.101 ms`, `overlap@10=8/10`) and Q3 `b_asof` examined `1,000` nodes (`median=33.096 ms`, `overlap@10=7/10`), still dropping `(1275, 3, 'Kekkosen aika Suomen tasavallan presidenttinä', d=0.6351)`.

### Way A vs Way B Passage Quality (`AS OF '2015-01-01 00:00:00'`, 3 query embeddings)

1. **Q1 — `Miten talvisota päättyi?` (`fi`, `exp_page = 1256`):** **Different / slightly narrower precision, comparable net quality (not meaningfully better)**, because Way A (`spec 010`) resolved `fi:1256` directly with `global_top50_sections=[None, 'Talvisodan seurauksista ja merkityksestä', 'Tausta', 'Moskovan rauha']` (`asof_rev=14547217`), where the 2014 `## Moskovan rauha` H2 already pulls both `Rauha` and `Tie rauhaan` subsections alongside `<lead>` and `Talvisodan seurauksista ja merkityksestä`. Way B pinned `#1 <lead> (d=0.3234)`, `#4 Rauha (d=0.4133)`, and `#5 Tie rauhaan (d=0.4229)` directly without `Tausta`, while dedicating 4/10 slots to *Jatkosota* (`page=440`) and losing 3 exact hits on `page=1150` to post-filtering. (At `2006-01-01` `rev=658274`, all three H2 headings from current `chunk_vector` missed and Way A triggered `<full_article_fallback>`, while Way B ranked `1256:0 <lead> (0.3391)`, `1256:4 [Rauha] (0.4208)`, `1256:8 [Talvisodan merkityksestä] (0.4391)` directly.)
2. **Q2 — `How did the Winter War end?` (`en`, `exp_page = 1256`):** **Different — stronger `fi:1256` section targeting within the 50 `fi` pages, worse cross-lingual coverage and worst index recall (`5/10`)**, because Way A's global top-50 on `chunk_vector` was dominated by English articles (`en:33924` *Winter War*, `en:13571260` *The Winter War (film)*), leaving only `[None]` (`<lead>`, triggering `<full_article_fallback>`) for `fi:1256`. Way B searched the historical `fi` snapshots directly and returned `1256` `#1 <lead>`, `#4 Tie rauhaan`, `#5 Talvisodan seurauksista ja merkityksestä`, and `#9 Rauha`, while mixing in `6816`, `440`, and `8617` and dropping `5/10` true exact-scan top-10 rows.
3. **Q3 — `Who was the president of Finland from 1956 to 1982?` (`en`, `exp_page = 1275`):** **Different, and net worse reliably**, because although Way B avoids current-heading rename drift (Way A's current `fi:1275` heading `'Presidenttinä'` was absent in `rev=14518017`, which used `'1956–1962: Ensimmäinen kausi'`..`'1978–1982: Neljäs kausi'`), Way A resolved `fi:1275` via sibling link (`en`/`sv` hits in `chunk_vector`) and fell back cleanly via `<full_article_fallback>` (`global_top50_sections=[]`). Way B retrieved `1275:0 <lead>`, `1275:9 ('1956–1962: Ensimmäinen kausi')`, `1275:12 ('1968–1978: Kolmas kausi')` plus `966363`/`534136`, **but HNSW post-filtering silently dropped `1275:8 ('1956–1962: Ensimmäinen kausi', d=0.5388)`** — one of the core historical passages answering the question.

## Limits met

* **Timebox:** Scoped to a 4-hour research spike; no full-dataset (`M`-scale) backfill or `mhnsw_ef_search` sweep was run.
* **Annual deduplicated snapshots vs true revision stream:** `snapshot_chunk_vector` stores at most one deduplicated end-of-year revision per `(page_id, year)` (from the 31 Dec `23:59:59 UTC` `wikihistory.article` snapshot series). Mid-year edits that were reverted or superseded before year-end do not appear in `chunk_vector_hist`.
* **Corpus scope (`50` Finnish articles):** `snapshot_chunk_vector` only covers the `50` Finnish articles in `wikihistory.article_list`, so Way B has no `en` or `sv` historical vectors (unlike Way A's `83,797`-row multi-language `chunk_vector`).
* **Precomputed vectors & default HNSW settings:** All row embeddings were copied verbatim from `snapshot_chunk_vector` (`bge-m3`, `1024`-d, zero bulk re-embedding), and benchmarks used MariaDB's default `mhnsw_ef_search = 80`. At full Wikipedia scale with dozens of versions per chunk, `AS OF` selectivity would fall well below `4.34%` and post-filtering recall would degrade much further.

## How to rebuild

`wikirag.chunk_vector_hist` is already populated on the VPS (`17,791` rows, `199.6` MB) and left in place. Both scripts live in `scripts/`:

* [scripts/wayb_build.py](file:///Users/camlynh/Documents/Anh_Tai/temp/setup-template/WikiGoldentime/scripts/wayb_build.py) — creates/populates `wikirag.chunk_vector_hist` from `wikirag.snapshot_chunk_vector` (zero Ollama calls).
* [scripts/wayb_query.py](file:///Users/camlynh/Documents/Anh_Tai/temp/setup-template/WikiGoldentime/scripts/wayb_query.py) — benchmarks `(a)`/`(b)`/`(c)` (`EXPLAIN`/`ANALYZE`, warm median/p90, `overlap@10`) and compares Way A vs Way B (3 Ollama query embeddings per run).

```sh
# Local pure-logic unit selftest (no DB/network required):
python3 scripts/wayb_build.py --selftest

# Rebuild on VPS (single article smoke test, then full 50-article history):
~/wikimemory/.venv/bin/python ~/wikimemory/wayb_build.py --pages 1256 --rebuild
~/wikimemory/.venv/bin/python ~/wikimemory/wayb_build.py --all-history --rebuild

# Run benchmark + Way A vs Way B comparison on VPS (uses 3 Ollama query embeddings):
~/wikimemory/.venv/bin/python ~/wikimemory/wayb_query.py --as-of "2015-01-01 00:00:00"
```

## Recommendation

Do **not** expose Way B in the product or follow-up spec; keep **Way A** (`chunk_vector` search + `wikihistory.article FOR SYSTEM_TIME AS OF`). Although MariaDB allows `VECTOR INDEX` on system-versioned tables and uses it under `FOR SYSTEM_TIME AS OF`, HNSW traverses the combined current+historical graph and post-filters `(row_start, row_end)` afterward — already dropping `30–50%` of exact top-10 matches (including primary answer chunk `1275:8` on the president question) at only `926` snapshots across `50` Finnish articles, while Way A already handles cross-lingual retrieval and heading-rename fallback cleanly via sibling/full-article fallback.
