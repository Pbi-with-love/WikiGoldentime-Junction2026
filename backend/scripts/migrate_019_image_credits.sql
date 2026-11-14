-- Spec 019: Add license_url, non_free, and credit_checked_at columns to wikirag.article_image.
-- Run once against wikirag on MariaDB (port 3307):
--   docker exec -i mariadb-vector-wikipedia-rag-mariadb-1 mariadb -uwikirag -pwikirag wikirag < backend/scripts/migrate_019_image_credits.sql

ALTER TABLE wikirag.article_image
  ADD COLUMN IF NOT EXISTS license_url VARCHAR(512) NULL AFTER license,
  ADD COLUMN IF NOT EXISTS non_free TINYINT(1) NOT NULL DEFAULT 0 AFTER artist,
  ADD COLUMN IF NOT EXISTS credit_checked_at DATETIME NULL AFTER non_free;
