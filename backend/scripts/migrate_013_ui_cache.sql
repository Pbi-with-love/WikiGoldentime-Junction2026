-- Spec 013: Add ui column to summary_cache and answer_cache for translated LLM responses.
-- Run once against wikirag on MariaDB (port 3307):
--   docker exec -i mariadb-vector-wikipedia-rag-mariadb-1 mariadb -u root -p"$DB_PASSWORD" wikirag < backend/scripts/migrate_013_ui_cache.sql

ALTER TABLE wikirag.summary_cache
  ADD COLUMN IF NOT EXISTS ui VARCHAR(3) NOT NULL DEFAULT '' AFTER rev_id,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (lang, page_id, rev_id, ui);

ALTER TABLE wikirag.answer_cache
  ADD COLUMN IF NOT EXISTS ui VARCHAR(3) NOT NULL DEFAULT '' AFTER q;
