-- Spec 022: Wikidata coordinates per item (NULL lat/lon = checked, no coordinate).
--   docker exec -i mariadb-vector-wikipedia-rag-mariadb-1 mariadb -uwikirag -pwikirag wikirag < backend/scripts/migrate_022_article_geo.sql
CREATE TABLE IF NOT EXISTS wikirag.article_geo (
  wikidata_id VARCHAR(16) NOT NULL PRIMARY KEY,
  lat DOUBLE NULL,
  lon DOUBLE NULL,
  source ENUM('P625','P276') NULL,
  checked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
