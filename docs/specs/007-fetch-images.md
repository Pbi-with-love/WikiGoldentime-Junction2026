# Spec 007: Article thumbnails from Wikimedia (article_image)

Read docs/memory/ARCHITECTURE.md first (Infrastructure section: SSH command, container names, no host
`mariadb` client, `~/wikimemory/.venv`, tmux rules, "never touch the organizers' apps"; Rules: images
credited to Commons).

## Goal
Build `wikirag.article_image`: for each of the 29,460 articles (fi 19,285 / sv 4,921 / en 5,254) the
lead image Wikipedia itself shows (PageImages), as a Commons file name, a thumbnail URL and the
Commons licence + author for the credit line. Feeds `thumb_url` / `thumb_file` of
`GET /api/article/{lang}/{page_id}` (a later api spec; the frontend already renders them and links the
credit to `https://commons.wikimedia.org/wiki/File:<thumb_file>`).

## Acceptance criteria
- [ ] `scripts/fetch_images.py` reads `(lang, page_id)` from `wikirag.article` ordered by
      `(lang, page_id)` and, per language, calls `https://{lang}.wikipedia.org/w/api.php` with
      `action=query&prop=pageimages&piprop=thumbnail|name&pithumbsize=500&pilicense=free&pageids=<50 ids joined by |>&format=json&formatversion=2&maxlag=5`
      (50 page ids per request, never more). Follows `continue` if present.
- [ ] Credit pass: the collected file names are looked up on Commons,
      `https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=extmetadata&iiextmetadatafilter=LicenseShortName|Artist&titles=File:<50 names joined by |>&format=json&formatversion=2&maxlag=5`
      (50 titles per request). A file that is `missing` on Commons is a local (wiki-only) file:
      **dropped, no row** (we only show images we can credit to Commons). Count dropped files.
- [ ] Table (pre-approved here; ARCHITECTURE lists the first four columns, `license`/`artist` are the
      credit data the Rules require):
      `article_image(lang, page_id, file_name VARCHAR(255) NOT NULL, thumb_url VARCHAR(1024) NOT NULL,
      license VARCHAR(64) NULL, artist VARCHAR(512) NULL, PRIMARY KEY (lang, page_id))`,
      `lang`/`page_id` types copied from `SHOW CREATE TABLE wikirag.article`, utf8mb4.
      `file_name` = PageImages `pageimage` as returned (bare name, underscores, no `File:` prefix).
      `artist` = extmetadata `Artist.value` with HTML tags stripped, `html.unescape`d, whitespace
      collapsed, cut to 512 chars; NULL if absent. `license` = `LicenseShortName.value` or NULL.
- [ ] **Articles without an image get no row** (no NULL rows). Same for page ids the live API reports
      `missing` (deleted/moved since the dump) and for non-Commons files. The api spec maps "no row" to
      `thumb_url: null, thumb_file: null`.
- [ ] Polite client: one request at a time (no concurrency), >= 1 s between requests, `maxlag=5`,
      gzip accepted, User-Agent from env `WIKIMEDIA_UA`, default
      `wikimemory/0.1 (Junction 2026 hackathon demo; contact: wikimemory-team@example.invalid) python-urllib`
      (generic contact, no personal data). On HTTP 429/5xx or a `maxlag` error: honour `Retry-After`
      (else back off 5, 10, 20, 40, 80 s), max 5 tries, then log the batch as failed and continue.
- [ ] Resumable: after each batch is committed, write `{lang: last_page_id_done}` atomically
      (tmp file + `os.replace`) to `~/wikimemory/fetch_images.progress.json`; a rerun skips finished
      page ids. Inserts are `INSERT ... ON DUPLICATE KEY UPDATE` (idempotent). `--restart` ignores the
      progress file. Failed batches are listed in the log and retried on the next run (they are not
      marked done).
- [ ] Flags: `--lang fi|sv|en` (default all), `--limit N` (first N articles per lang, for a dry run),
      `--restart`, `--self-test`, `--db-host/--db-port` (default 127.0.0.1:3307).
- [ ] `--self-test` runs offline asserts on embedded sample JSON (one pageimages response with an
      image, a page without one and a `missing` page; one imageinfo response with an HTML `Artist` and
      a `missing` file) and exits non-zero on failure. No network, no DB.
- [ ] End-of-run log line per language: articles, requests, rows, no-image, missing pages, non-Commons
      dropped, failed batches, elapsed seconds. Script exits non-zero if any batch failed after retries.
- [ ] Rows exist for the demo articles fi 1256 (Talvisota), fi 1150 (Suomen sisällissota),
      fi 440 (Jatkosota); every `thumb_url` starts with `https://upload.wikimedia.org/`.
- [ ] Every row joins `wikirag.article` on (lang, page_id) (anti-join = 0).

## Assumptions
- Volume: ~590 pageimages requests + up to ~590 Commons requests ≈ 1,200 requests at >= 1 s each,
  about 20–30 min. Runs on the VPS in tmux (outbound HTTPS to Wikimedia is assumed open; if not,
  run on the Mac through an SSH tunnel to 127.0.0.1:3307 with `--db-host/--db-port`).
- `pilicense=free` (also the API default) already excludes non-free lead images; the Commons pass
  additionally drops free local files we cannot credit to Commons.
- `pithumbsize=500`: a width Wikimedia serves as a standard thumbnail step; enough for the article
  panel header. No image download or re-hosting: the frontend hotlinks `upload.wikimedia.org`.
- HTTP with stdlib only (`urllib.request`, `json`, `gzip`, `html`, `re`); no new dependency.
  DB: the same driver and connect() settings as `~/mariadb-vector-wikipedia-rag/common.py`.
  Python env `~/wikimemory/.venv` (create with `python3 -m venv` if missing; spec 003 may already
  have made it). Insert with `executemany`.
- page_ids are the dump's; the live wiki may have moved/deleted some. Those count as `missing`.
- No dependency on other specs; can run in parallel with 003 (different table, separate file).

## Scope
- May edit: `scripts/fetch_images.py` (new).
- On the VPS may create: `~/wikimemory/fetch_images.py` (copy), `~/wikimemory/fetch_images.log`,
  `~/wikimemory/fetch_images.progress.json`, table `wikirag.article_image`.
- Must not touch: `src/` (frontend stays on mock; switching `/api/article` is a later spec),
  `index.html`, `docs/memory/*`, other specs, `scripts/requirements.txt` (owned by spec 003; no new
  packages needed here), any existing `wikirag`/`wikihistory` table, the organizers' repos/venvs,
  tmux sessions `app` and `tm`, both containers' configuration.

## Boundaries
- Always: run `--self-test`, then a `--limit 100` dry run per language, then the full run; run the SQL
  checks below before reporting; follow docs/memory/CONVENTIONS.md.
- Reuse the organizers' DB connect settings; never rewrite their code.
- Precompute: images are fetched once into the table; never call Wikimedia at request time.
- Ask first (via `orca orchestration ask`): any new dependency, any schema change beyond
  `article_image` as specified, raising the request rate or adding concurrency.
- Never: commit secrets or a personal email in the User-Agent; stop or restart containers or the
  `app`/`tm` sessions; download or store image bytes; delete failing tests.

## Open questions (defaults chosen)
- Contact in the User-Agent: Wikimedia's policy asks for a reachable contact. Default is a generic
  placeholder; the orchestrator may set `WIKIMEDIA_UA` on the VPS with a team address or repo URL.
- `license`/`artist` columns are an addition to the ARCHITECTURE table list; orchestrator should
  record them in ARCHITECTURE "New tables" if accepted. The api spec decides whether to expose them
  (frontend today shows only the file name linked to Commons).
- No-image articles: no row (chosen) rather than NULL rows; coverage % = rows / articles per lang.
- Commons-only (chosen): free local files are dropped. If coverage turns out very low for `en`,
  revisit (report the dropped count).
- Stale data: reruns upsert but never delete rows whose image was removed on Wikipedia; acceptable
  for the demo (`--restart` + `TRUNCATE` if ever needed, ask first).

## Approach (Hydrogen)
1. On the VPS: `SHOW CREATE TABLE wikirag.article`; read the organizers' `common.py` connect().
2. Write `scripts/fetch_images.py`; run `--self-test` locally.
3. `scp` to `~/wikimemory/`; `--limit 100` per language; inspect 5 rows; then the full run in tmux.
4. Run the SQL checks; rerun the script once to show resume (it should finish with ~0 requests).

## Commands
- SSH: `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes root@72.61.20.120`
- Copy: `scp -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes scripts/fetch_images.py root@72.61.20.120:~/wikimemory/`
- Self-test: `python3 scripts/fetch_images.py --self-test` (local) and `~/wikimemory/.venv/bin/python ~/wikimemory/fetch_images.py --self-test` (VPS)
- Dry run: `cd ~/wikimemory && .venv/bin/python fetch_images.py --limit 100 --restart`
- Full run: `ssh ... "tmux new -d -s images 'cd ~/wikimemory && /usr/bin/time -v .venv/bin/python fetch_images.py --restart > fetch_images.log 2>&1'"`
- Resume check: `cd ~/wikimemory && .venv/bin/python fetch_images.py >> fetch_images.log 2>&1; tail -5 fetch_images.log`
- Test SQL (on the VPS):
  `docker exec mariadb-vector-wikipedia-rag-mariadb-1 mariadb -uwikirag -pwikirag wikirag -e "SELECT a.lang, COUNT(*) articles, COUNT(i.page_id) images, ROUND(100*COUNT(i.page_id)/COUNT(*),1) pct, SUM(i.license IS NULL) no_license, SUM(i.artist IS NULL) no_artist FROM article a LEFT JOIN article_image i USING (lang, page_id) GROUP BY a.lang WITH ROLLUP; SELECT COUNT(*) FROM article_image i LEFT JOIN article a USING (lang, page_id) WHERE a.page_id IS NULL; SELECT COUNT(*) FROM article_image WHERE thumb_url NOT LIKE 'https://upload.wikimedia.org/%'; SELECT i.*, a.title FROM article_image i JOIN article a USING (lang, page_id) WHERE (lang, page_id) IN (('fi',1256),('fi',1150),('fi',440),('sv',23612),('en',33924));"`

## Evidence required in worker_done
One consolidated report:
- Files changed.
- `--self-test` output (local and VPS).
- Output of the Test SQL: per-lang articles / rows / coverage % (and total over 29,460), both checks = 0,
  the sample rows (title, file_name, thumb_url, license, artist).
- Script end-of-run log lines (requests, no-image, missing, non-Commons dropped, failed batches = 0)
  and exit code.
- Timing: `/usr/bin/time -v` elapsed wall time and max RSS.
- Resume check: tail of the second run (no re-fetch of finished batches).
- The User-Agent string actually used.
- HTTP codes of :8000 and :8001 after the run.
- Open issues / assumptions.

## Failure semantics
Non-zero script exit, failed batches > 0 after a rerun, anti-join > 0, a non-`upload.wikimedia.org`
thumb_url, or no row for fi 1256 / 1150 / 440 = Task failed (not a deliverable).
