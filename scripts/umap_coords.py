#!/usr/bin/env python3
"""Precompute 3D UMAP coordinates for all wikirag articles from bge-m3 Parquet vectors.

Reads vectors-bge-m3-{fi,sv,en}.parquet, runs PCA(50) + joint 3D UMAP(cosine, seed=42),
scales and clips coordinates to the frontend galaxy frame, and atomically replaces
wikirag.article_coord via article_coord_new + RENAME TABLE.
"""

import argparse
import gc
import os
import sys
import time

import mariadb
import numpy as np
import pyarrow.compute as pc
import pyarrow.parquet as pq
from sklearn.decomposition import PCA
import umap

LANGS = ("fi", "sv", "en")
EMBED_DIM = 1024
PCA_DIMS = 50
RANDOM_STATE = 42
BATCH_SIZE = 1000
EF_SEARCH = 80

# Frontend frame targets (1st..99th percentile half-range) and hard clip limits
TARGET_HALF = np.array([36.0, 22.0, 28.0], dtype=np.float64)
CLIP_LIMITS = np.array([40.0, 25.0, 32.0], dtype=np.float64)

CREATE_NEW_TABLE_SQL = """
CREATE TABLE article_coord_new (
  lang CHAR(2) NOT NULL,
  page_id INT(10) UNSIGNED NOT NULL,
  x FLOAT NOT NULL,
  y FLOAT NOT NULL,
  z FLOAT NOT NULL,
  PRIMARY KEY (lang, page_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci
"""


def connect(host: str, port: int, user: str, password: str, database: str):
    """Connect using the same mariadb driver and settings as common.py."""
    con = mariadb.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        database=database,
        autocommit=False,
    )
    cur = con.cursor()
    cur.execute(f"SET mhnsw_ef_search = {EF_SEARCH}")
    cur.close()
    return con


def load_parquet_vectors(data_dir: str):
    """Load embeddings directly to a single float32 numpy matrix without Python lists."""
    paths = [os.path.join(data_dir, f"vectors-bge-m3-{lang}.parquet") for lang in LANGS]
    for path in paths:
        if not os.path.isfile(path):
            raise FileNotFoundError(f"Missing Parquet file: {path}")

    row_counts = [pq.read_metadata(path).num_rows for path in paths]
    total_rows = sum(row_counts)
    assert total_rows > 0, "Parquet files contain 0 rows"

    embeddings = np.empty((total_rows, EMBED_DIM), dtype=np.float32)
    langs = np.empty(total_rows, dtype="U2")
    page_ids = np.empty(total_rows, dtype=np.uint32)

    distinct_models = set()
    per_lang_counts = {}
    offset = 0

    for expected_lang, path, expected_n in zip(LANGS, paths, row_counts):
        table = pq.read_table(path, columns=["lang", "page_id", "model", "embedding"])
        n = table.num_rows
        assert n == expected_n, f"{path}: metadata num_rows={expected_n} != actual={n}"

        file_models = set(pc.unique(table.column("model")).to_pylist())
        distinct_models.update(file_models)

        file_langs = set(pc.unique(table.column("lang")).to_pylist())
        assert file_langs == {expected_lang}, f"{path}: unexpected lang values {file_langs}"

        pid_arr = table.column("page_id").combine_chunks()
        assert pid_arr.null_count == 0, f"{path}: page_id has nulls"
        pid_np = pid_arr.to_numpy(zero_copy_only=False)
        assert np.unique(pid_np).size == n, f"{path}: duplicate page_id values within lang={expected_lang}"

        emb_col = table.column("embedding").combine_chunks()
        assert emb_col.null_count == 0, f"{path}: embedding column has nulls"
        assert emb_col.values.null_count == 0, f"{path}: embedding values have nulls"
        assert emb_col.type.list_size == EMBED_DIM, (
            f"{path}: expected dim {EMBED_DIM}, got {emb_col.type.list_size}"
        )
        assert emb_col.offset == 0, f"{path}: unexpected Arrow slice offset {emb_col.offset}"

        emb_np = emb_col.values.to_numpy().reshape(n, EMBED_DIM)
        assert emb_np.dtype == np.float32, f"{path}: expected float32, got {emb_np.dtype}"
        assert np.isfinite(emb_np).all(), f"{path}: non-finite values in embedding"

        embeddings[offset : offset + n] = emb_np
        langs[offset : offset + n] = expected_lang
        page_ids[offset : offset + n] = pid_np
        per_lang_counts[expected_lang] = n
        offset += n

        del table, pid_arr, pid_np, emb_col, emb_np
        gc.collect()

    assert len(distinct_models) == 1, f"Expected 1 distinct model, got {distinct_models}"
    assert distinct_models == {"bge-m3"}, f"Unexpected model set: {distinct_models}"
    assert offset == total_rows

    print(f"Loaded {total_rows} vectors (models={sorted(distinct_models)}, counts={per_lang_counts})")
    return langs, page_ids, embeddings, per_lang_counts


def run_pca(embeddings: np.ndarray) -> np.ndarray:
    """Reduce 1024-d float32 embeddings to 50-d float32 via deterministic PCA."""
    t0 = time.monotonic()
    pca = PCA(n_components=PCA_DIMS, random_state=RANDOM_STATE)
    x_pca = pca.fit_transform(embeddings).astype(np.float32, copy=False)
    print(
        f"PCA -> {x_pca.shape} ({x_pca.dtype}) in {time.monotonic() - t0:.1f}s, "
        f"explained_var={pca.explained_variance_ratio_.sum():.4f}"
    )

    assert np.isfinite(x_pca).all(), "Non-finite values after PCA"
    norms = np.linalg.norm(x_pca, axis=1)
    assert np.all(norms > 0), "Zero-norm vector after PCA; cosine distance undefined"
    return x_pca


def run_umap_and_scale(x_pca: np.ndarray) -> np.ndarray:
    """Run joint 3D cosine UMAP and scale/clip coordinates to the frontend frame."""
    t1 = time.monotonic()
    reducer = umap.UMAP(
        n_components=3,
        n_neighbors=15,
        min_dist=0.1,
        metric="cosine",
        random_state=RANDOM_STATE,
    )
    raw = reducer.fit_transform(x_pca).astype(np.float64, copy=False)
    print(f"UMAP -> {raw.shape} in {time.monotonic() - t1:.1f}s")

    assert np.isfinite(raw).all(), "Non-finite values in UMAP output"

    medians = np.median(raw, axis=0)
    centered = raw - medians
    p1 = np.percentile(centered, 1.0, axis=0)
    p99 = np.percentile(centered, 99.0, axis=0)
    half_span = np.maximum(np.abs(p1), np.abs(p99))
    assert np.all(half_span > 0), f"Degenerate UMAP axis spread: p1={p1}, p99={p99}"

    print(
        f"Raw UMAP median={medians.round(4).tolist()}, "
        f"p1_rel={p1.round(4).tolist()}, p99_rel={p99.round(4).tolist()}"
    )

    scaled = centered * (TARGET_HALF / half_span)
    clipped = np.clip(scaled, -CLIP_LIMITS, CLIP_LIMITS).astype(np.float32)

    assert np.isfinite(clipped).all(), "Non-finite values after scaling/clipping"
    for axis, name in enumerate(("x", "y", "z")):
        lim = float(CLIP_LIMITS[axis])
        lo = float(clipped[:, axis].min())
        hi = float(clipped[:, axis].max())
        assert lo >= -lim and hi <= lim, f"Axis {name} out of bounds [-{lim}, {lim}]: [{lo}, {hi}]"

    p1_out = np.percentile(clipped, 1.0, axis=0)
    p99_out = np.percentile(clipped, 99.0, axis=0)
    print(
        "Scaled/clipped p1..p99="
        f"[{p1_out.round(2).tolist()} .. {p99_out.round(2).tolist()}], "
        f"x=[{clipped[:,0].min():.3f}, {clipped[:,0].max():.3f}], "
        f"y=[{clipped[:,1].min():.3f}, {clipped[:,1].max():.3f}], "
        f"z=[{clipped[:,2].min():.3f}, {clipped[:,2].max():.3f}]"
    )
    return clipped


def write_and_swap(con, langs: np.ndarray, page_ids: np.ndarray, coords: np.ndarray):
    """Write coordinates to article_coord_new and atomically swap into article_coord."""
    total_rows = len(langs)
    cur = con.cursor()
    try:
        cur.execute("DROP TABLE IF EXISTS article_coord_new")
        cur.execute("DROP TABLE IF EXISTS article_coord_old")
        cur.execute(CREATE_NEW_TABLE_SQL)
        con.commit()

        insert_sql = "INSERT INTO article_coord_new (lang, page_id, x, y, z) VALUES (?, ?, ?, ?, ?)"
        for start in range(0, total_rows, BATCH_SIZE):
            end = min(start + BATCH_SIZE, total_rows)
            batch = [
                (
                    str(langs[i]),
                    int(page_ids[i]),
                    float(coords[i, 0]),
                    float(coords[i, 1]),
                    float(coords[i, 2]),
                )
                for i in range(start, end)
            ]
            cur.executemany(insert_sql, batch)
            con.commit()

        cur.execute("SELECT COUNT(*) FROM article_coord_new")
        staged_count = cur.fetchone()[0]
        assert staged_count == total_rows, (
            f"Staged row count {staged_count} != expected {total_rows}"
        )

        cur.execute(
            "SELECT COUNT(*) FROM information_schema.tables "
            "WHERE table_schema = DATABASE() AND table_name = 'article_coord'"
        )
        exists = cur.fetchone()[0] > 0
        if exists:
            cur.execute(
                "RENAME TABLE article_coord TO article_coord_old, "
                "article_coord_new TO article_coord"
            )
            cur.execute("DROP TABLE article_coord_old")
        else:
            cur.execute("RENAME TABLE article_coord_new TO article_coord")
        con.commit()
    finally:
        cur.close()


def verify_db(con, expected_total: int, expected_per_lang: dict[str, int]):
    """Run assert-based self-checks against the live article_coord table."""
    cur = con.cursor()
    try:
        cur.execute(
            """
            SELECT
              COUNT(*) AS total,
              SUM(CASE WHEN x IS NULL OR y IS NULL OR z IS NULL THEN 1 ELSE 0 END) AS null_cnt,
              SUM(CASE WHEN NOT (x >= -40.0 AND x <= 40.0)
                         OR NOT (y >= -25.0 AND y <= 25.0)
                         OR NOT (z >= -32.0 AND z <= 32.0) THEN 1 ELSE 0 END) AS oob_cnt,
              MIN(x), MAX(x), MIN(y), MAX(y), MIN(z), MAX(z)
            FROM article_coord
            """
        )
        total, null_cnt, oob_cnt, min_x, max_x, min_y, max_y, min_z, max_z = cur.fetchone()
        assert total == expected_total, f"DB count {total} != Parquet count {expected_total}"
        assert null_cnt == 0, f"Found {null_cnt} NULL coordinate rows"
        assert oob_cnt == 0, f"Found {oob_cnt} out-of-bounds rows"

        cur.execute("SELECT lang, COUNT(*) FROM article_coord GROUP BY lang")
        db_per_lang = dict(cur.fetchall())
        assert db_per_lang == expected_per_lang, (
            f"Per-lang counts {db_per_lang} != expected {expected_per_lang}"
        )

        cur.execute(
            "SELECT COUNT(*) FROM article a LEFT JOIN article_coord c USING (lang, page_id) "
            "WHERE c.page_id IS NULL"
        )
        missing_in_coord = cur.fetchone()[0]
        assert missing_in_coord == 0, f"Articles missing from article_coord: {missing_in_coord}"

        cur.execute(
            "SELECT COUNT(*) FROM article_coord c LEFT JOIN article a USING (lang, page_id) "
            "WHERE a.page_id IS NULL"
        )
        orphan_in_coord = cur.fetchone()[0]
        assert orphan_in_coord == 0, f"Orphan rows in article_coord: {orphan_in_coord}"

        print(
            "SELF-CHECK PASS: "
            f"rows={total} per_lang={db_per_lang} "
            f"x=[{min_x:.3f},{max_x:.3f}] y=[{min_y:.3f},{max_y:.3f}] z=[{min_z:.3f},{max_z:.3f}] "
            f"anti_joins=(0,0) nulls=0 oob=0"
        )
    finally:
        cur.close()


def parse_args():
    parser = argparse.ArgumentParser(description="Build wikirag.article_coord via joint 3D UMAP.")
    parser.add_argument(
        "--data-dir",
        default=os.path.expanduser("~/mariadb-vector-wikipedia-rag/data"),
        help="Directory containing vectors-bge-m3-{fi,sv,en}.parquet",
    )
    parser.add_argument("--db-host", default=os.environ.get("DB_HOST", "127.0.0.1"))
    parser.add_argument("--db-port", type=int, default=int(os.environ.get("DB_PORT", 3307)))
    parser.add_argument("--db-user", default=os.environ.get("DB_USER", "wikirag"))
    parser.add_argument("--db-password", default=os.environ.get("DB_PASSWORD", "wikirag"))
    parser.add_argument("--db-name", default=os.environ.get("DB_NAME", "wikirag"))
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    t_start = time.monotonic()

    langs, page_ids, embeddings, per_lang_counts = load_parquet_vectors(args.data_dir)
    expected_total = len(langs)

    x_pca = run_pca(embeddings)
    del embeddings
    gc.collect()

    coords = run_umap_and_scale(x_pca)
    del x_pca
    gc.collect()

    con = connect(
        host=args.db_host,
        port=args.db_port,
        user=args.db_user,
        password=args.db_password,
        database=args.db_name,
    )
    try:
        write_and_swap(con, langs, page_ids, coords)
        verify_db(con, expected_total, per_lang_counts)
    finally:
        con.close()

    print(f"Done in {time.monotonic() - t_start:.1f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
