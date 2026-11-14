# Spec 002: Merge wikihistory into the 3307 server

Read docs/memory/ARCHITECTURE.md first (Infrastructure section: SSH command, container names, no host
`mariadb` client, tmux rules, "never touch the organizers' apps").

## Goal
Copy the `wikihistory` database (container `mariadb-system-versioning-wikipedia-mariadb-1`,
127.0.0.1:3308) into the `wikirag` server (container `mariadb-vector-wikipedia-rag-mariadb-1`,
127.0.0.1:3307) as a second database, with full system-versioning history, so one SQL statement can
join `wikirag` vectors with `wikihistory.article FOR SYSTEM_TIME AS OF`. The 3308 copy stays the
source and stays running. The copy must be re-runnable when the full dataset M is loaded.

## Acceptance criteria
- [ ] `scripts/db_merge.sh` exists and runs on the VPS. Mode `merge` (default) copies; mode `verify`
      compares source and target and exits non-zero on any mismatch.
- [ ] On 3307, `wikihistory.article` is `WITH SYSTEM VERSIONING` and `row_start`/`row_end` are still
      INVISIBLE (`SHOW CREATE TABLE` matches the 3308 one, ignoring AUTO_INCREMENT values).
- [ ] `verify` gives identical results on 3308 and 3307 for:
      - `SELECT COUNT(*) FROM wikihistory.article FOR SYSTEM_TIME ALL` -> 31,848 now
      - `SELECT COUNT(*) FROM wikihistory.article` (current rows) -> 50 now
      - `SELECT COUNT(*) FROM wikihistory.article_list` -> 50 now
      - fingerprint, run with `SET time_zone='+00:00'`:
        `SELECT MIN(row_start), MAX(row_start), SUM(CRC32(CONCAT_WS('|', page_id, rev_id, sha1, row_start, row_end))) FROM wikihistory.article FOR SYSTEM_TIME ALL`
- [ ] User `wikirag` on 3307 has `ALL PRIVILEGES ON wikihistory.*` (later specs create
      `history_stats`/`month_stats` there). A user `wikihistory`/`wikihistory` also exists on 3307
      with `ALL PRIVILEGES ON wikihistory.*`, same host part as on 3308, so the reused organizers'
      code works by changing only the port.
- [ ] A cross-database query works on 3307 as user `wikirag` (sample below) and its time is measured.
- [ ] Re-running `merge` is safe: it replaces only the tables that come from the dump (`article`,
      `article_list`) and never drops the `wikihistory` database or other tables in it (future
      `history_stats`, `month_stats`).
- [ ] Container 3308 and tmux sessions `app` (:8000) and `tm` (:8001) are untouched and still answer
      after the merge (`curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8001/` before and after).
- [ ] The script header (comment block) documents the full-dataset-M path: either rerun
      `db_merge.sh` in tmux after the full load into 3308, or point the organizers' loader directly at
      3307. The worker reads the organizers' loader in `~/mariadb-system-versioning-wikipedia` (README,
      load script, env/port settings) and writes the exact command for whichever option works; if the
      loader cannot target 3307 without editing organizer code, say so and keep the rerun path.
- [ ] `docs/memory/ARCHITECTURE.md` Infrastructure: replace the "Plan (spec 002)" bullet with the
      result (wikihistory lives on 3307 too; 3308 is the source for reloads; rerun command).

## Assumptions
- Both servers are MariaDB >= 10.11 (needed for `mariadb-dump --dump-history` and
  `system_versioning_insert_history`). The worker checks `SELECT VERSION()` on both first and stops
  with a `question` if either is older.
- Method (default): stream, no dump file on disk:
  `docker exec SRC mariadb-dump --dump-history --single-transaction --tz-utc wikihistory article article_list | docker exec -i DST mariadb wikihistory`
  as root on both sides; DST session must allow history inserts
  (`SET SESSION system_versioning_insert_history=1`; `secure_timestamp` must permit it). Check the
  dump output contains that SET; if not, prepend it. `CREATE DATABASE IF NOT EXISTS wikihistory` on
  DST runs first.
- Root passwords come from the containers' own env (`docker exec C sh -c 'mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" ...'`;
  check which env var the container uses with `docker exec C env`). No password is written to the repo.
- Full M (~19,750 articles / ~862k versions, 5–7 GB stored compressed) will produce a larger
  uncompressed stream; streaming avoids disk use (76 GB free). Run it then in
  `tmux new -d -s merge '...'`. Today only the 50-article set is copied.
- No new port or service is opened.

## Scope
- May edit: `scripts/db_merge.sh` (new), `docs/memory/ARCHITECTURE.md` (Infrastructure section only).
- On the VPS may create: `~/wikimemory/` (copy of the script), database `wikihistory` on 3307, the
  grants above.
- Must not touch: `src/`, `index.html`, other specs, the 3308 container and its data, the organizers'
  repos, venvs, tmux sessions `app` and `tm`, and the `wikirag` database tables.

## Boundaries
- Always: run `verify` before reporting; `SET time_zone='+00:00'` in every SVT query; follow
  docs/memory/CONVENTIONS.md.
- Reuse the organizers' code (search, as_of, versions, clean); never rewrite it. This spec writes no
  Python; it copies data only.
- Ask first (via `orca orchestration ask`): any change to the 3308 server, restarting any container,
  new dependencies, any schema change beyond copying `wikihistory` as-is.
- Never: commit secrets; stop/remove the 3308 container or the `app`/`tm` sessions; `DROP DATABASE`;
  delete failing tests.

## Open questions (defaults chosen)
- Load full M into 3308 then rerun the merge, or load it straight into 3307? Default: rerun the
  merge (keeps the organizers' time machine on 3308 working with the full set too); the worker
  documents the direct option if the loader supports it.
- Should 3308 eventually be retired? Default: no, out of scope.

## Approach (Hydrogen)
1. On the VPS: check versions, root env vars, users/hosts on 3308 (`SELECT user,host FROM mysql.user`),
   record the `verify` numbers on 3308 and the :8001 HTTP code.
2. Write `scripts/db_merge.sh` (modes `merge`, `verify`), `scp` it to `~/wikimemory/`, run `merge`
   then `verify`.
3. Create grants; run the sample query as `wikirag` with `time`.
4. Update ARCHITECTURE.md Infrastructure.

## Commands
- SSH: `ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes root@72.61.20.120`
- Copy: `scp -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes scripts/db_merge.sh root@72.61.20.120:~/wikimemory/`
- Run: `ssh ... 'bash ~/wikimemory/db_merge.sh merge'` (full M later: `ssh ... "tmux new -d -s merge 'bash ~/wikimemory/db_merge.sh merge > ~/wikimemory/merge.log 2>&1'"`)
- Test: `ssh ... 'bash ~/wikimemory/db_merge.sh verify'` (exit 0 = pass)
- Sample cross-database query (on 3307 as `wikirag`, timed with `time docker exec ...`):
  ```sql
  SET time_zone = '+00:00';
  SET mhnsw_ef_search = 80;
  SELECT n.page_id, a.title, h.rev_id, h.row_start, LENGTH(h.text) AS len_2010
  FROM (
    SELECT v.page_id, VEC_DISTANCE_COSINE(v.embedding,
           (SELECT embedding FROM wikirag.article_vector WHERE lang='fi' AND page_id=1256)) AS d
    FROM wikirag.article_vector v WHERE v.lang = 'fi'
    ORDER BY d LIMIT 20
  ) n
  JOIN wikirag.article a ON a.lang = 'fi' AND a.page_id = n.page_id
  JOIN wikihistory.article FOR SYSTEM_TIME AS OF TIMESTAMP '2010-01-01 00:00:00' h
       ON h.page_id = n.page_id
  ORDER BY n.d;
  ```
  (Nearest neighbours of Talvisota that also have history, as of 2010. If `article_vector` needs a
  `model` filter, add it. With 50 articles loaded, few or no neighbours may have history: also run
  the plain join `SELECT COUNT(*) FROM wikirag.article a JOIN wikihistory.article FOR SYSTEM_TIME AS OF TIMESTAMP '2010-01-01 00:00:00' h ON h.page_id = a.page_id WHERE a.lang='fi'`.)

## Evidence required in worker_done
One consolidated report:
- Files changed.
- `SELECT VERSION()` of both servers.
- `verify` output: the four checks on 3308 vs 3307 side by side, exit code 0.
- `SHOW CREATE TABLE wikihistory.article` on 3307.
- `SHOW GRANTS FOR` both users on 3307.
- Both sample queries: output rows and measured time.
- Merge duration for the 50 articles, and the documented full-M command (rerun or direct load).
- HTTP code of :8000 and :8001 before and after; `docker ps` showing both containers up.
- Open issues / assumptions.

## Failure semantics
`verify` non-zero exit, or any change to 3308 / `app` / `tm` = Task failed (not a deliverable).
