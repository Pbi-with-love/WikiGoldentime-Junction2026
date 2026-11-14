# Spec 019: Image credits for Commons thumbnails (licence, author, file page) + real User-Agent

Read docs/memory/ARCHITECTURE.md first (Infrastructure: SSH command, container names, no host
`mariadb` client, `~/wikimemory/.venv`, tmux, "never touch the organizers' apps"; Rules: images
credited to Commons; API contract). Then read docs/specs/007-fetch-images.md (how `article_image`
was built) and `scripts/fetch_images.py`.

## Goal
Every article image the app shows carries a proper Commons credit: author, licence (linked to the
licence text when Commons gives a URL) and a link to the Commons file page. Non-free images are
never shown. All our calls to Wikimedia send a descriptive User-Agent with a real contact.


**Amendment 019-A (user decision, after Part A merged as e0ffbcc): show Credit when the artist is missing.**
Part A found 578 rows without artist, 165 distinct files of them with a Commons `Credit` value (e.g. "SA-kuva"), but did not store it.
Part B therefore also: (1) adds a nullable `credit` column to `wikirag.article_image` in a new migration
`backend/scripts/migrate_019b_image_credit.sql` (approved); (2) extends `scripts/fetch_images.py --credits-only` with a
resumable mode that fetches extmetadata `Credit` (HTML stripped to plain text, max 200 chars) only for rows where
`artist IS NULL OR artist = ''` (expected ~4 requests), same User-Agent and politeness; (3) exposes `credit` in the
`/api/article` `image` object; (4) the caption uses `credit` in place of the artist when the artist is missing
("Kuva: {credit}, {license}" / "Bild: …" / "Image: …"); only when both are missing does it fall back to "Wikimedia Commons".
Evidence: rows with credit filled, request count, screenshot of one credit-only image (e.g. an SA-kuva photo).

## Two parts (separate dispatches)
| Part | What | Files | When |
|---|---|---|---|
| **A** data + UA | migration, extend `fetch_images.py`, credits-only run on the VPS | `scripts/fetch_images.py`, `backend/scripts/migrate_019_image_credits.sql` | **Any time**, alongside 016/017/018: disjoint files, VPS only, no API/UI change |
| **B** API + UI | `/api/article` `image` object, contract, mock, caption | `backend/main.py`, `backend/test_api.py`, `src/mock/*`, `src/ui.js`, `src/i18n.js`, `index.html`, `src/styles.css` | **After A is done AND after 018 is merged** (016 owns `src/ui.js`/`src/i18n.js` now; 017/018 follow) |

Dispatch text for Part A: "... Implement Part A only." For Part B: "... Implement Part B only."
No Argon step: the change is one caption line; its wording and layout are fixed in B4 below.

## What exists today (checked by the spec writer)
- `wikirag.article_image(lang, page_id, file_name, thumb_url, license VARCHAR(64) NULL,
  artist VARCHAR(512) NULL)`, 15,355 rows. `license` (= extmetadata `LicenseShortName`) and
  `artist` (= `Artist`, HTML stripped) were **already stored** by spec 007. Missing: licence URL and
  a non-free flag.
- `scripts/fetch_images.py` is the only code that calls Wikimedia (grep for `wikipedia.org/w/api`,
  `wikimedia.org/w/api`, `User-Agent` over `scripts/` and `backend/` found nothing else). Its
  default UA has the placeholder `wikimemory-team@example.invalid`.
- `/api/article` (`backend/main.py` `ARTICLE_WITH_IMAGE_SQL`, `get_article`) returns
  `thumb_url` + `thumb_file` only. The panel caption (`src/ui.js` ~line 2455, key
  `panel.commonsCredit` = "Wikimedia Commons: {file}") shows the raw file name.

## Acceptance criteria

### Part A — data + User-Agent (VPS)
- [ ] **A1. Migration** `backend/scripts/migrate_019_image_credits.sql` (schema change approved for
      exactly these columns, nothing else):
      ```sql
      ALTER TABLE wikirag.article_image
        ADD COLUMN IF NOT EXISTS license_url VARCHAR(512) NULL AFTER license,
        ADD COLUMN IF NOT EXISTS non_free TINYINT(1) NOT NULL DEFAULT 0 AFTER artist,
        ADD COLUMN IF NOT EXISTS credit_checked_at DATETIME NULL AFTER non_free;
      ```
      Header comment with the run command, like `migrate_013_ui_cache.sql`. Idempotent (run twice = no error).
- [ ] **A2. User-Agent.** `DEFAULT_UA` in `scripts/fetch_images.py` becomes exactly
      `wikimemory/0.2 (https://github.com/Pbi-with-love/WikiGoldentime-Junction2026; Junction 2026 hackathon demo) python-urllib/3`
      (the repo's `origin` remote converted to https; no email). `WIKIMEDIA_UA` env still overrides.
      Re-grep `scripts/` and `backend/` for any other Wikimedia caller; if one exists, give it the same
      UA string (import nothing new; a copied constant is fine) and list it in the report.
- [ ] **A3. Extend the shared Commons pass** (reuse `PoliteClient`, `fetch_paginated_query`,
      `_split_commons_chunks`, `clean_metadata_text`; no new HTTP code):
      - `iiextmetadatafilter=LicenseShortName|LicenseUrl|Artist|Credit|NonFree` (50 titles per request max, `maxlag=5`, unchanged).
      - `CommonsMeta` gains `license_url` and `non_free`.
        `license_url` = `LicenseUrl.value` cleaned; `//x` becomes `https://x`; kept only if it then
        starts with `https://` or `http://`, else NULL (it ends up in an `href`: trust boundary).
        `non_free` = `NonFree.value` in (`"true"`, `"1"`, `True`) OR licence matches
        `/non-free|fair use/i`.
      - `Credit` is not stored; it is only counted: rows with `artist` NULL and a non-empty Credit
        (log line, for the open question below).
      - `CREATE_TABLE_SQL` and `UPSERT_SQL` include `license_url`, `non_free`,
        `credit_checked_at = UTC_TIMESTAMP()` so a future full rerun fills them too.
- [ ] **A4. `--credits-only` mode**: reads `SELECT DISTINCT file_name FROM article_image WHERE
      credit_checked_at IS NULL` (resumable by that column; no progress file needed; `--restart`
      clears `credit_checked_at` first), fetches Commons metadata in chunks, and per chunk runs one
      `UPDATE article_image SET license=?, license_url=?, artist=?, non_free=?, credit_checked_at=UTC_TIMESTAMP() WHERE file_name=?`
      (`executemany`) and commits. A file now `missing` on Commons: set `credit_checked_at`, leave the
      other columns as they are, count it as `missing_on_commons` (do not delete rows). It never calls
      `{lang}.wikipedia.org` (PageImages is not re-fetched). Failed chunks: logged, left unchecked,
      retried on the next run; non-zero exit if any failed.
      End log line: `SUMMARY credits files=… requests=… updated=… missing_on_commons=… non_free=… artist_null_credit_present=… failed_chunks=… elapsed_s=…`.
- [ ] **A5. `--self-test`** gains offline cases (no network, no DB): a `LicenseUrl` with `//`
      prefix becomes `https://…`; a `javascript:` LicenseUrl becomes NULL; `NonFree: "true"` gives
      `non_free=True`; `LicenseShortName: "Fair use"` gives `non_free=True`; existing cases still pass.
- [ ] **A6. Run** on the VPS: migration, self-test, `--credits-only --limit`-style dry run is not
      needed (the update is idempotent), then the full run in tmux at low priority (Commands below).
      One process, sequential requests, >= 1.05 s apart (existing `MIN_REQUEST_INTERVAL_S`).
      Rerun once afterwards: it must end with `files=0 requests=0`.
- [ ] **A7. Data checks** (Test SQL below): `credit_checked_at IS NULL` = 0 rows; rows for fi 1256 /
      1150 / 440 have a non-NULL `license`; row count still 15,355 (no deletes).

### Part B — API + UI (after A and after 018)
- [ ] **B1. `/api/article/{lang}/{page_id}` additive.** Keep every existing key. Add
      `image`: `null` when there is no row **or** `non_free = 1`; otherwise
      `{"thumb_url": str, "file_page_url": str, "license": str|null, "license_url": str|null, "artist": str|null}`
      with `file_page_url = "https://commons.wikimedia.org/wiki/File:" + urllib.parse.quote(file_name)`.
      When `non_free = 1`, `thumb_url` and `thumb_file` are also `null` (the image is hidden everywhere).
      SQL: extend `ARTICLE_WITH_IMAGE_SQL` (and `ARTICLE_NO_IMAGE_SQL` with `NULL AS …`); no extra query.
- [ ] **B2. Tests.** `backend/test_api.py::test_article_shape_and_errors`: key set includes `image`;
      for fi 1256 `image` is an object with `file_page_url` starting
      `https://commons.wikimedia.org/wiki/File:`, `license` a non-empty string, and
      `image.thumb_url == art["thumb_url"]`. Add one test: an article whose row has `non_free = 1`
      returns `image: null, thumb_url: null` (skip with a reason if A found 0 non-free rows).
- [ ] **B3. Contract + mock.** In `src/mock/contract.test.js`, only the `GET /api/article` test:
      `image` is `null` or an object with the 5 keys above (`file_page_url` a string starting
      `https://commons.wikimedia.org/wiki/File:`; the others string or null). Same assertions in mock
      and real mode. `src/mock/index.js` article builder returns `image` built from the existing
      `thumbInfo` (`license: "CC BY-SA 4.0"`, `license_url: "https://creativecommons.org/licenses/by-sa/4.0/"`,
      `artist: "[mock] Kaamos illustration"`), or `null` when there is no thumb. `src/api.js` needs no change
      (pass-through); do not edit it.
- [ ] **B4. Caption** (`src/ui.js` panel header, `index.html` figcaption, `src/styles.css`):
      - Render only when `article.image` is non-null (fall back to hiding the figure, as today when
        there is no thumb).
      - With a licence: caption = `t("panel.imageCredit", {artist, license})` where the `{artist}`
        slot is a link to `image.file_page_url` with text `image.artist`, or `Wikimedia Commons` when
        artist is null; the `{license}` slot is a link to `image.license_url`, or plain text when
        `license_url` is null.
      - Without a licence: caption = link to `image.file_page_url` with text `t("panel.commonsCredit")`.
      - Build the caption with DOM nodes (`textContent`, `createElement("a")`): **never** put
        `artist`/`license` into `innerHTML` (they are third-party text). Split the template on
        `{artist}` / `{license}` to place the links, so word order stays per language.
      - Artist text longer than 80 chars is cut to 79 + "…" with the full text in `title`.
      - Links: `target="_blank" rel="noopener noreferrer"`, styled like the current
        `#panel-thumb-credit` (frost, underline, snow on hover). No `·` separators (001 rule).
      - The raw file name is no longer shown anywhere in the panel caption.
- [ ] **B5. Strings** in `src/i18n.js` (all three tables; keep `src/i18n.test.js` green):

      | key | en | fi | sv |
      |---|---|---|---|
      | `panel.imageCredit` (new) | `Image: {artist}, {license}` | `Kuva: {artist}, {license}` | `Bild: {artist}, {license}` |
      | `panel.commonsCredit` (changed, no `{file}`) | `Wikimedia Commons` | `Wikimedia Commons` | `Wikimedia Commons` |

      "Image/Kuva/Bild" rather than "Photo" because many lead images are maps, flags or coats of arms.
- [ ] **B6.** The topic-road card caption (`src/ui.js` ~line 1300, "Wikimedia Commons · {file}") is
      mock-only data and stays unchanged in this spec.

## Assumptions
- Volume for A: distinct file names <= 15,355, so <= ~310 Commons requests (+ any `continue` pages)
  at >= 1.05 s each: about 6 minutes. Outbound HTTPS from the VPS worked for spec 007.
- `DescriptionUrl` is not fetched: the file page URL is derived from `file_name` (same rule the UI
  uses today), which saves an `iiprop=url` round trip.
- Commons does not host non-free files, so `non_free` is expected to be 0 everywhere; the flag is a
  guard, not a known problem. `pilicense=free` in 007 already excluded non-free lead images.
- The GitHub repo `Pbi-with-love/WikiGoldentime-Junction2026` is public (the user asked for the repo
  URL as the contact). If it is private, the orchestrator must say so before Part A runs.
- Part A does not change the API, so the running `api` tmux session needs no restart for A.

## Scope
Part A
- May edit: `scripts/fetch_images.py`, `backend/scripts/migrate_019_image_credits.sql` (new); any
  other Wikimedia caller found by the A2 grep (UA constant only; report it).
- On the VPS may: copy those two files to `~/wikimemory/`, run the migration, run the script in tmux
  session `credits`, write `~/wikimemory/fetch_images_credits.log`.
Part B
- May edit: `backend/main.py` (article SQL + `get_article` response only), `backend/test_api.py`
  (article tests only), `src/mock/contract.test.js` (`GET /api/article` test only),
  `src/mock/index.js` (article builder only), `src/ui.js` (panel header caption only), `src/i18n.js`
  (the two keys only), `src/i18n.test.js` (only if a parity test needs it), `index.html` (the
  `panel-thumb-figure` figcaption only), `src/styles.css` (`.panel-thumb-*` rules only).
- On the VPS may: deploy `backend/main.py` + `backend/test_api.py`, restart only our `api` tmux session.
Both parts — Must not touch: `docs/memory/*`, `docs/specs/*`, `docs/design/*`, `src/api.js`,
`src/mock/fixtures.js`, `backend/history.py`, `backend/summary.py`, `backend/ask.py`, any other table
or column, the 3308 container, the organizers' repos/venvs and the `app`/`tm` sessions.

## Boundaries
- Always: follow docs/memory/CONVENTIONS.md; run `--self-test` before any network run; run tests
  before reporting; long jobs in tmux with `nice -n 19`; keep the API change additive.
- Ask first (via `orca orchestration ask`): any schema change beyond A1, any new dependency, raising
  the request rate or adding concurrency, deleting `article_image` rows, edits outside scope.
- Never: an email or personal data in the User-Agent; call Wikimedia at request time; show an image
  with `non_free = 1`; download image bytes; put API text into `innerHTML`; stop/restart
  containers or `app`/`tm`; delete failing tests.

## Open questions (defaults chosen)
- `Credit` field (e.g. "SA-kuva") when `artist` is NULL: default not stored or shown; A reports
  `artist_null_credit_present`. If large, a follow-up can add a `credit` column and use it as the
  artist fallback.
- Non-free images found: default hide (B1) and list them in the report; no deletion.
- Licence text not translated ("Public domain", "CC BY-SA 4.0" are shown as Commons gives them).
- The author string is shown as Commons gives it (may be "Unknown author" in English on a fi UI).
- `docs/i18n-review.csv` regeneration is the orchestrator's job after B (`node scripts/export_i18n_review.mjs`).

## Approach (Hydrogen)
Part A
1. Write the A5 self-test cases first (red), then A2–A4 in `scripts/fetch_images.py`; `--self-test` green locally.
2. scp both files; run migration twice (idempotent); self-test on the VPS; full run in tmux; rerun for the resume check; Test SQL.
Part B
1. B2/B3 assertions first; then `backend/main.py`; deploy; restart `api`; pytest on the VPS.
2. Mock `image`, then caption + strings; `npm test` mock, then `REAL=article` through the tunnel.
3. Playwright flows below.

## Commands
- SSH: `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes root@72.61.20.120` (scp takes the same flags)
- Migration (VPS): `docker exec -i mariadb-vector-wikipedia-rag-mariadb-1 mariadb -uwikirag -pwikirag wikirag < ~/wikimemory/migrate_019_image_credits.sql`
  (if `wikirag` lacks ALTER, use root as in `migrate_013_ui_cache.sql`)
- Self-test: `python3 scripts/fetch_images.py --self-test` (local) and `~/wikimemory/.venv/bin/python ~/wikimemory/fetch_images.py --self-test` (VPS)
- Full run (VPS): `tmux new -d -s credits 'cd ~/wikimemory && nice -n 19 /usr/bin/time -v .venv/bin/python fetch_images.py --credits-only > fetch_images_credits.log 2>&1'`
- Resume check: `cd ~/wikimemory && .venv/bin/python fetch_images.py --credits-only | tail -2`
- Test SQL (VPS):
  `docker exec mariadb-vector-wikipedia-rag-mariadb-1 mariadb -uwikirag -pwikirag wikirag -e "SELECT COUNT(*) total, SUM(credit_checked_at IS NULL) unchecked, SUM(license IS NOT NULL) with_license, ROUND(100*SUM(license IS NOT NULL)/COUNT(*),1) license_pct, SUM(license_url IS NOT NULL) with_license_url, SUM(artist IS NULL) no_artist, SUM(non_free) non_free FROM article_image; SELECT license, COUNT(*) n FROM article_image GROUP BY license ORDER BY n DESC LIMIT 15; SELECT lang, page_id, file_name, license, license_url, artist, non_free FROM article_image WHERE non_free = 1 OR (lang, page_id) IN (('fi',1256),('fi',1150),('fi',440),('sv',23612),('en',33924));"`
- Backend tests (VPS): `cd ~/wikimemory && .venv/bin/pytest backend/test_api.py -q`
- Curl (VPS): `curl -s http://127.0.0.1:8002/api/article/fi/1256 | python3 -c "import json,sys; a=json.load(sys.stdin); print(json.dumps({k:a[k] for k in ('thumb_url','thumb_file','image')}, ensure_ascii=False, indent=1))"`
  Timing: `for i in $(seq 10); do curl -s -o /dev/null -w '%{time_total}\n' http://127.0.0.1:8002/api/article/fi/1256; done | sort -n | sed -n 5p`
- Contract (local): `npm test` (mock) and `REAL=article npm test` with the tunnel `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes -N -L 8002:127.0.0.1:8002 root@72.61.20.120`
- Dev server for Playwright (real data via the tunnel and `vite.config.js` proxy): `npm run dev`

## Playwright (Part B)
Screenshots to `artifacts/screenshots/019-image-credits/`.
1. UI language fi (switcher) -> search "Talvisota" -> open fi 1256 -> caption reads `Kuva: <artist>, <licence>`; artist link href = Commons file page; licence link href = licence URL (or plain text) -> `01-fi-talvisota.png`.
2. Same with UI language sv -> `Bild: …` -> `02-sv-talvisota.png`.
3. Same with UI language en -> `Image: …` -> `03-en-talvisota.png`.
4. An article whose row has `license IS NULL` (pick one with SQL; skip with a note if none) -> caption is the single link `Wikimedia Commons` -> `04-no-license.png`.
5. An article without an image row -> no figure, no console error -> `05-no-image.png`.
No console errors in any flow.

## Evidence required in worker_done
One consolidated report, per part.
Part A:
- Files changed; the UA string printed by the run; result of the A2 grep.
- Migration output (both runs); `--self-test` output local + VPS.
- `SUMMARY credits` line: requests, files, updated, missing_on_commons, non_free,
  artist_null_credit_present, failed_chunks (= 0), elapsed; `/usr/bin/time -v` wall time + max RSS.
- Test SQL output: total (15,355), unchecked (0), licence coverage % and licence-URL count, licence
  distribution (top 15), rows with NULL artist, non-free rows listed (expected none), the 5 sample rows.
- Resume check tail (`files=0 requests=0`). HTTP codes of :8000 and :8001 after the run.
Part B:
- Files changed + `git diff --stat`.
- pytest pass/fail counts (VPS); `npm test` counts mock and `REAL=article`.
- The curl output for fi 1256 (`thumb_url`, `thumb_file`, `image`) and the median response time
  (must stay under 300 ms).
- Screenshot paths 01–05 and the caption text seen in each.
- Open issues / assumptions.

## Failure semantics
Task failed (not a deliverable) if any of:
- Part A: non-zero script exit or `failed_chunks > 0` after one rerun; `unchecked > 0`; row count
  != 15,355; a UA containing an email or the placeholder; any request to `{lang}.wikipedia.org` in
  `--credits-only`; concurrent requests; any schema change beyond A1.
- Part B: any existing `/api/article` key removed or renamed; pytest or contract failure in either
  mode; a caption built with `innerHTML` from API text; a non-free image shown; the raw file name
  still shown in the panel caption; missing fi/sv/en screenshots.
- Either: any touch to `docs/memory/*`, `backend/history.py`, the 3308 container or `app`/`tm`.
