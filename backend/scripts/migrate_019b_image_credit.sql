-- Spec 019 Amendment 019-A: Add nullable credit column to wikirag.article_image.
-- Run once against wikirag on MariaDB (port 3307):
--   docker exec -i mariadb-vector-wikipedia-rag-mariadb-1 mariadb -uwikirag -pwikirag wikirag < backend/scripts/migrate_019b_image_credit.sql

ALTER TABLE wikirag.article_image
  ADD COLUMN IF NOT EXISTS credit VARCHAR(200) NULL AFTER artist;
