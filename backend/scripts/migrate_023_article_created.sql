-- Spec 023: article creation time (fi from wikihistory.history_stats.first_edit = MIN(row_start); sv/en from the MediaWiki API).
--   docker exec -i mariadb-vector-wikipedia-rag-mariadb-1 mariadb -uwikirag -pwikirag wikirag < backend/scripts/migrate_023_article_created.sql
CREATE TABLE IF NOT EXISTS wikirag.article_created (
  lang CHAR(2) NOT NULL,
  page_id BIGINT NOT NULL,
  created_at DATETIME NULL,
  source ENUM('svt','api') NOT NULL,
  checked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (lang, page_id)
) ENGINE=InnoDB;
