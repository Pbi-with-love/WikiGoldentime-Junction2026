ALTER TABLE wikirag.summary_cache ADD COLUMN IF NOT EXISTS source_hash CHAR(64) NULL AFTER ui;
ALTER TABLE wikirag.answer_cache  ADD COLUMN IF NOT EXISTS source_hash CHAR(64) NULL AFTER ui;
CREATE TABLE IF NOT EXISTS wikirag.history_cache (
    lang VARCHAR(3) NOT NULL,
    page_id INT UNSIGNED NOT NULL,
    rev_id BIGINT UNSIGNED NOT NULL,
    json LONGTEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (lang, page_id, rev_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
