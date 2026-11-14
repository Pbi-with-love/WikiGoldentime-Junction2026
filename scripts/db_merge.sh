#!/usr/bin/env bash
# db_merge.sh — Copy the `wikihistory` database (with full system-versioning history)
# from the 3308 container into the 3307 `wikirag` container, or verify parity.
#
# Usage:
#   bash ~/wikimemory/db_merge.sh          # defaults to `merge`
#   bash ~/wikimemory/db_merge.sh merge    # streams wikihistory.{article,article_list} 3308 -> 3307
#   bash ~/wikimemory/db_merge.sh verify   # compares counts, fingerprint, and schema 3308 vs 3307
#
# Safe to re-run:
#   - `CREATE DATABASE IF NOT EXISTS wikihistory` runs on 3307 first.
#   - `mariadb-dump` only dumps `article` and `article_list`, so re-running `merge` drops and
#     recreates only those two tables and never drops `wikihistory` or other tables in it
#     (such as future `history_stats` / `month_stats`).
#   - Container 3308 is read-only (`--single-transaction`) and untouched.
#
# Full dataset M path (~19,750 articles / ~862k versions, read from ~/mariadb-system-versioning-wikipedia):
#   In ~/mariadb-system-versioning-wikipedia, `download.py --all` fetches all 16 history dumps
#   (4.5 GB), `load.py --list data/articles-all.tsv` loads all ~19,750 articles, and `common.py`
#   reads DB_HOST (127.0.0.1), DB_PORT (default 3308), DB_USER (wikihistory), DB_PASSWORD
#   (wikihistory), and DB_NAME (wikihistory) from environment variables or a `.env` file.
#   Both options below work without editing any organizer code:
#
#   Option 1 (Default — keeps the organizers' Time Machine on 3308 working with full M too):
#     1) Download all dumps and load full dataset M into 3308 in tmux:
#        tmux new -d -s full-load 'cd ~/mariadb-system-versioning-wikipedia && .venv/bin/python download.py --all && .venv/bin/python load.py --list data/articles-all.tsv > ~/wikimemory/load3308.log 2>&1'
#     2) After loading finishes, rerun the merge and verify in tmux:
#        tmux new -d -s merge 'bash ~/wikimemory/db_merge.sh merge > ~/wikimemory/merge.log 2>&1 && bash ~/wikimemory/db_merge.sh verify >> ~/wikimemory/merge.log 2>&1'
#
#   Option 2 (Direct load into 3307 — supported natively via DB_PORT in common.py):
#     Requires the `wikihistory` DB, user/grants, and tables on 3307 (created by this script; or
#     `DB_PORT=3307 .venv/bin/python create_tables.py` on a fresh server). `load.py` skips
#     `page_id`s already present in `article`:
#        tmux new -d -s load3307 'cd ~/mariadb-system-versioning-wikipedia && .venv/bin/python download.py --all && DB_PORT=3307 .venv/bin/python load.py --list data/articles-all.tsv > ~/wikimemory/load3307.log 2>&1'
#     Note: Option 2 leaves 3308 with only the 50-article set, so `db_merge.sh verify` (which
#     compares 3308 vs 3307) will report a mismatch unless 3308 is also loaded.

set -euo pipefail

SRC_CONTAINER="${SRC_CONTAINER:-mariadb-system-versioning-wikipedia-mariadb-1}"
DST_CONTAINER="${DST_CONTAINER:-mariadb-vector-wikipedia-rag-mariadb-1}"
DB_NAME="${DB_NAME:-wikihistory}"
TABLES=(article article_list)

exec_mariadb() {
  local container="$1"
  shift
  docker exec "$container" sh -c 'exec mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" "$@"' _ "$@"
}

exec_mariadb_stdin() {
  local container="$1"
  shift
  docker exec -i "$container" sh -c 'exec mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" "$@"' _ "$@"
}

check_version_ge_10_11() {
  local container="$1"
  local label="$2"
  local version major minor
  version="$(exec_mariadb "$container" -N -B -e "SELECT VERSION()")"
  if [[ "$version" =~ ^([0-9]+)\.([0-9]+) ]]; then
    major="${BASH_REMATCH[1]}"
    minor="${BASH_REMATCH[2]}"
  else
    echo "ERROR: Could not parse MariaDB version on $label ($container): $version" >&2
    return 1
  fi
  if (( major < 10 || (major == 10 && minor < 11) )); then
    echo "ERROR: $label ($container) MariaDB $version is older than required 10.11" >&2
    return 1
  fi
  printf '%s (%s): MariaDB %s\n' "$label" "$container" "$version"
}

check_prereqs() {
  check_version_ge_10_11 "$SRC_CONTAINER" "source 3308"
  check_version_ge_10_11 "$DST_CONTAINER" "target 3307"

  local svt_insert
  svt_insert="$(exec_mariadb "$DST_CONTAINER" -N -B -e "SET SESSION system_versioning_insert_history=1; SELECT @@SESSION.system_versioning_insert_history;")"
  if [[ "$svt_insert" != "1" ]]; then
    echo "ERROR: Could not enable SESSION system_versioning_insert_history=1 on $DST_CONTAINER (check secure_timestamp)." >&2
    return 1
  fi
}

ensure_target_db_and_grants() {
  exec_mariadb "$DST_CONTAINER" -e "CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci;"

  local host_list create_user_sql
  host_list="$(exec_mariadb "$SRC_CONTAINER" -N -B -e "SELECT host FROM mysql.user WHERE user='wikihistory' ORDER BY host")"
  if [[ -z "$host_list" ]]; then
    echo "ERROR: Expected user 'wikihistory' not found on source $SRC_CONTAINER" >&2
    return 1
  fi

  local grants_sql=""
  while IFS= read -r host; do
    [[ -z "$host" ]] && continue
    create_user_sql="$(exec_mariadb "$SRC_CONTAINER" -N -B -e "SHOW CREATE USER 'wikihistory'@'${host}'")"
    create_user_sql="${create_user_sql/CREATE USER /CREATE USER IF NOT EXISTS }"
    grants_sql+="${create_user_sql};"$'\n'
    grants_sql+="GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO 'wikihistory'@'${host}';"$'\n'
  done <<< "$host_list"

  grants_sql+="GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO 'wikirag'@'%';"$'\n'
  grants_sql+="FLUSH PRIVILEGES;"$'\n'

  exec_mariadb_stdin "$DST_CONTAINER" <<< "$grants_sql"
}

do_merge() {
  echo "Checking prerequisites..."
  check_prereqs

  echo "Ensuring database '${DB_NAME}' and grants on ${DST_CONTAINER}..."
  ensure_target_db_and_grants

  echo "Checking mariadb-dump --dump-history emits system_versioning_insert_history..."
  local header_sample init_cmd
  header_sample="$(docker exec "$SRC_CONTAINER" sh -c \
    'exec mariadb-dump -uroot -p"$MARIADB_ROOT_PASSWORD" --dump-history --single-transaction --tz-utc --where="1=0" "$1" "$2" "$3"' \
    _ "$DB_NAME" "${TABLES[@]}")"

  if ! grep -q "system_versioning_insert_history=1" <<< "$header_sample"; then
    echo "Notice: dump header did not show system_versioning_insert_history=1; enforcing via --init-command."
  fi

  init_cmd="SET SESSION time_zone='+00:00', system_versioning_insert_history=1"
  echo "Streaming ${DB_NAME}.{${TABLES[*]}} from ${SRC_CONTAINER} (3308) to ${DST_CONTAINER} (3307)..."
  local start_ts end_ts
  start_ts="$(date +%s)"

  docker exec "$SRC_CONTAINER" sh -c \
    'exec mariadb-dump -uroot -p"$MARIADB_ROOT_PASSWORD" --dump-history --single-transaction --tz-utc --max-allowed-packet=16M "$1" "$2" "$3"' \
    _ "$DB_NAME" "${TABLES[@]}" \
  | docker exec -i "$DST_CONTAINER" sh -c \
    'exec mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" --max-allowed-packet=16M --init-command="$1" "$2"' \
    _ "$init_cmd" "$DB_NAME"

  end_ts="$(date +%s)"
  echo "Merge completed in $((end_ts - start_ts))s."
}

query_metrics() {
  local container="$1"
  exec_mariadb_stdin "$container" -N -B "$DB_NAME" <<'SQL'
SET time_zone = '+00:00';
SELECT 'all_rows', COUNT(*) FROM article FOR SYSTEM_TIME ALL;
SELECT 'current_rows', COUNT(*) FROM article;
SELECT 'article_list_rows', COUNT(*) FROM article_list;
SELECT 'fingerprint', CONCAT_WS(' | ', MIN(row_start), MAX(row_start), SUM(CRC32(CONCAT_WS('|', page_id, rev_id, sha1, row_start, row_end)))) FROM article FOR SYSTEM_TIME ALL;
SQL
}

normalize_create_table() {
  sed -E 's/ AUTO_INCREMENT=[0-9]+//g'
}

do_verify() {
  local failed=0
  local src_raw dst_raw

  src_raw="$(query_metrics "$SRC_CONTAINER")"
  dst_raw="$(query_metrics "$DST_CONTAINER")"

  printf '%-20s | %-74s | %-74s | %s\n' "Check" "3308 (source)" "3307 (target)" "Result"
  printf '%-20s-+-%-74s-+-%-74s-+-%s\n' "--------------------" "--------------------------------------------------------------------------" "--------------------------------------------------------------------------" "--------"

  local key src_val dst_val status
  for key in all_rows current_rows article_list_rows fingerprint; do
    src_val="$(awk -F'\t' -v k="$key" '$1 == k {print $2}' <<< "$src_raw")"
    dst_val="$(awk -F'\t' -v k="$key" '$1 == k {print $2}' <<< "$dst_raw")"
    if [[ -n "$src_val" && "$src_val" == "$dst_val" ]]; then
      status="OK"
    else
      status="MISMATCH"
      failed=1
    fi
    printf '%-20s | %-74s | %-74s | %s\n' "$key" "$src_val" "$dst_val" "$status"
  done

  local src_ddl dst_ddl src_ddl_norm dst_ddl_norm ddl_status="OK"
  src_ddl="$(exec_mariadb "$SRC_CONTAINER" -N -B "$DB_NAME" -e "SHOW CREATE TABLE article" | cut -f2-)"
  dst_ddl="$(exec_mariadb "$DST_CONTAINER" -N -B "$DB_NAME" -e "SHOW CREATE TABLE article" | cut -f2-)"
  src_ddl_norm="$(normalize_create_table <<< "$src_ddl")"
  dst_ddl_norm="$(normalize_create_table <<< "$dst_ddl")"

  if [[ "$src_ddl_norm" != "$dst_ddl_norm" ]]; then
    ddl_status="MISMATCH"
    failed=1
  fi
  if ! grep -q "WITH SYSTEM VERSIONING" <<< "$dst_ddl" || ! grep -q '`row_start` .*INVISIBLE' <<< "$dst_ddl" || ! grep -q '`row_end` .*INVISIBLE' <<< "$dst_ddl"; then
    ddl_status="MISMATCH (missing SVT/INVISIBLE)"
    failed=1
  fi
  printf '%-20s | %-74s | %-74s | %s\n' "create_article" "matches schema + SVT + INVISIBLE" "matches schema + SVT + INVISIBLE" "$ddl_status"

  local src_list_ddl dst_list_ddl list_ddl_status="OK"
  src_list_ddl="$(exec_mariadb "$SRC_CONTAINER" -N -B "$DB_NAME" -e "SHOW CREATE TABLE article_list" | cut -f2- | normalize_create_table)"
  dst_list_ddl="$(exec_mariadb "$DST_CONTAINER" -N -B "$DB_NAME" -e "SHOW CREATE TABLE article_list" | cut -f2- | normalize_create_table)"
  if [[ "$src_list_ddl" != "$dst_list_ddl" ]]; then
    list_ddl_status="MISMATCH"
    failed=1
  fi
  printf '%-20s | %-74s | %-74s | %s\n' "create_article_list" "matches schema" "matches schema" "$list_ddl_status"

  if (( failed != 0 )); then
    echo "VERIFY FAILED: source (3308) and target (3307) do not match." >&2
    if [[ "$ddl_status" != "OK" ]]; then
      echo "--- 3308 SHOW CREATE TABLE article ---" >&2
      printf '%b\n' "$src_ddl" >&2
      echo "--- 3307 SHOW CREATE TABLE article ---" >&2
      printf '%b\n' "$dst_ddl" >&2
    fi
    return 1
  fi

  echo "VERIFY PASSED: 3307 matches 3308 across all checks."
}

MODE="${1:-merge}"
case "$MODE" in
  merge)
    do_merge
    ;;
  verify)
    do_verify
    ;;
  *)
    echo "Usage: $0 [merge|verify]" >&2
    exit 2
    ;;
esac
