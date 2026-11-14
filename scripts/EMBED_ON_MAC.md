# Embedding `wikirag.chunk` on Mac

`scripts/embed_chunks.py` runs on your Mac against local Ollama (`bge-m3`) and writes directly into `wikirag.chunk_vector` on the VPS over an SSH tunnel (avoiding slow 2-vCPU bulk embedding on the VPS).

---

## 1. Install Ollama and pull `bge-m3`

```bash
brew install ollama          # or: brew install --cask ollama
brew services start ollama   # or run 'ollama serve' in a dedicated terminal
ollama pull bge-m3
ollama list
```

Verify that `bge-m3:latest` has ID **`790764642607`** (matching the VPS model). `embed_chunks.py` also checks `/api/tags` on startup and exits non-zero if the digest differs.

---

## 2. Create the Mac Python venv (outside the repo)

On macOS, `mariadb==1.1.15` compiles against `mariadb_config` from Homebrew's `mariadb-connector-c` (keg-only):

```bash
brew install mariadb-connector-c
python3 -m venv ~/.venvs/wikimemory
~/.venvs/wikimemory/bin/pip install --upgrade pip
PATH="/opt/homebrew/opt/mariadb-connector-c/bin:$PATH" ~/.venvs/wikimemory/bin/pip install mariadb==1.1.15
```

(If you are on Intel macOS where Homebrew lives under `/usr/local`, replace `/opt/homebrew` with `/usr/local`.)

---

## 3. Open the SSH tunnel to MariaDB (keep open in Terminal 1)

```bash
ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes -N -L 3307:127.0.0.1:3307 root@72.61.20.120
```

If local port `3307` is already in use, forward `-L 13307:127.0.0.1:3307` and pass `--db-port 13307` to `embed_chunks.py`.

---

## 4. Run the small batch first (test questions + 50 history articles)

In Terminal 2 from the repo root:

```bash
~/.venvs/wikimemory/bin/python scripts/embed_chunks.py --pages-from small 2>&1 | tee embed_small.log
```

This embeds the chunks for the 50 articles in `wikihistory.article_list` (which includes all 37 `data/test-questions.tsv` answer pages) plus their cross-language `sv`/`en` siblings (`121` pages, `2,040` total chunks, `2,028` to embed; single-chunk articles are already copied). On Apple M2 (`~1.8 chunks/s`), the small batch takes ~19 min.

After `--pages-from small` finishes, run the early partial hit@k check on the VPS:

```bash
ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes root@72.61.20.120 'cd ~/wikimemory && .venv/bin/python eval_chunks.py --partial'
```

---

## 5. Run the full embedding (`--all`)

On Apple M2 (`~1.8 chunks/s`), embedding the remaining `~62,300` chunks takes ~9.5–10 hours (safe to stop with `Ctrl-C` and resume across sessions):

```bash
~/.venvs/wikimemory/bin/python scripts/embed_chunks.py --pages-from all 2>&1 | tee embed_all.log
```

(`--all` is an alias for `--pages-from all`.) To embed one language at a time in order:

```bash
~/.venvs/wikimemory/bin/python scripts/embed_chunks.py --pages-from all --lang fi 2>&1 | tee -a embed_all.log
~/.venvs/wikimemory/bin/python scripts/embed_chunks.py --pages-from all --lang sv 2>&1 | tee -a embed_all.log
~/.venvs/wikimemory/bin/python scripts/embed_chunks.py --pages-from all --lang en 2>&1 | tee -a embed_all.log
```

---

## 6. Resume after Ctrl-C or interruption

Press `Ctrl-C` at any time (the current uncommitted batch rolls back cleanly). Re-run the exact same command; chunks already in `chunk_vector` are skipped automatically via `LEFT JOIN ... WHERE cv.page_id IS NULL` with no duplicates:

```bash
~/.venvs/wikimemory/bin/python scripts/embed_chunks.py --pages-from all 2>&1 | tee -a embed_all.log
```

---

## 7. Full evaluation & DB verification (after `--all` completes)

```bash
ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes root@72.61.20.120 '
cd ~/wikimemory && .venv/bin/python eval_chunks.py
docker exec mariadb-vector-wikipedia-rag-mariadb-1 mariadb -uwikirag -pwikirag wikirag -e "
SELECT lang, COUNT(DISTINCT page_id) articles, COUNT(*) chunks, SUM(reused) reused, AVG(words) avg_words, MAX(words) max_words FROM chunk GROUP BY lang WITH ROLLUP;
SELECT COUNT(*) FROM chunk_vector;
SELECT COUNT(*) FROM chunk c LEFT JOIN chunk_vector v USING (lang, page_id, chunk_no) WHERE v.page_id IS NULL;
SELECT COUNT(*) FROM chunk_vector v LEFT JOIN chunk c USING (lang, page_id, chunk_no) WHERE c.page_id IS NULL;
SELECT COUNT(*) FROM article a LEFT JOIN chunk c USING (lang, page_id) WHERE c.page_id IS NULL;
SELECT COUNT(DISTINCT model) FROM chunk_vector;
SELECT chunk_no, section, words, LEFT(text, 80) FROM chunk WHERE lang='\''fi'\'' AND page_id=1256;
SHOW CREATE TABLE chunk_vector\G
"
'
```
