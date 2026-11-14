# wikimemory

**Explore how Wikipedia remembers history.**

A 3D galaxy of Finnish-history Wikipedia articles with a time slider. Every star is an article, placed by meaning (vector search). Drag through the years and watch articles appear, grow, drift and flare up in edit wars (system-versioned tables). Ask a question and fly to the articles that answer it, with cited sources (RAG).

Built for the MariaDB challenge *Wikipedia Through Time* at Junction 2026, on both tracks: **RAG** and **SVT**.

> **Status:** infrastructure ready, building the product. Features below are marked ✅ done, 🚧 in progress, ⏳ planned.

---

## Features


|     | Feature                                                                                                                                       | MariaDB feature used                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 🚧  | **Galaxy:** 29,460 articles (fi, sv, en) as stars, positioned by UMAP of their bge-m3 vectors. Topics cluster by themselves.                  | `VECTOR(1024)`, vector index             |
| 🚧  | **Search and fly:** ask in any language, the matching stars light up and the camera flies to them.                                            | `VEC_DISTANCE_COSINE`, HNSW index        |
| ⏳   | **Ask:** a short answer written by an LLM from the retrieved articles, with numbered sources linking back to Wikipedia.                       | vector search + joins                    |
| ⏳   | **Time slider:** read any article as it stood on any date, 2003–2026, with real Wikipedia edit times.                                         | `FOR SYSTEM_TIME AS OF`                  |
| ⏳   | **Edit wars:** stars pulse red in months where named editors kept undoing each other.                                                         | `FOR SYSTEM_TIME ALL` + window functions |
| ⏳   | **Language gaps:** topics that exist only in Finnish show up as dark regions; fi/sv/en versions of a topic form a constellation.              | `wikidata_id` joins                      |
| ⏳   | **Semantic drift:** yearly snapshots of an article are embedded, so its star visibly moves through meaning-space as its content is rewritten. | SVT + vectors combined                   |


---

## Data

All data comes from the organizers' datasets ([mariadb-wikipedia-datasets](https://github.com/MariaDB/mariadb-wikipedia-datasets)).


| Dataset | What                                                                                                                     | Used for                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| **S**   | 29,460 current articles on the history of Finland (19,285 fi, 4,921 sv, 5,254 en), one bge-m3 vector each, category tree | Galaxy, search, Ask           |
| **M**   | Every saved version of the Finnish articles, 2003 – 1 Oct 2026 (862,076 versions)                                        | Time slider, edit wars, drift |
| **L**   | All 568,416 Finnish Wikipedia articles, current text                                                                     | Scalability demo              |


Currently loaded: all of S, and 50 articles / 31,848 versions of M (the 50 most relevant: the RAG test-question answers, the five early presidents, and the most edited articles). Loading all of M is a one-liner (see *Setup*).

**Join key between the two databases:** `page_id` of the Finnish article. Example: *Talvisota* (Winter War) is `page_id = 1256` in both.

---

## Architecture

```
               ┌────────────────────────────── VPS (Ubuntu 24.04) ──────────────────────────────┐
               │                                                                                 │
  Browser ─SSH tunnel─►  FastAPI backend  ──►  MariaDB "wikirag"      (127.0.0.1:3307)           │
  (3D frontend)│          │                    article, article_vector, article_coord,           │
               │          │                    category_link, article_category                   │
               │          ├──────────────►  MariaDB "wikihistory"  (127.0.0.1:3308)              │
               │          │                    article WITH SYSTEM VERSIONING, article_stats     │
               │          ├──────────────►  Ollama bge-m3           (127.0.0.1:11434)             │
               │          └──────────────►  LLM API (for Ask)                                     │
               └─────────────────────────────────────────────────────────────────────────────────┘

```

Every service listens on `127.0.0.1` only. Access from a laptop goes through an SSH tunnel.

---

## Setup

Tested on a Hostinger KVM VPS: Ubuntu 24.04, 2 vCPU, 8 GB RAM, 96 GB disk, no GPU.

### 1. System

```bash
# Swap: protects against out-of-memory while MariaDB and Ollama run together
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Packages. If docker.io conflicts with a preinstalled Docker CE, leave it out: Docker is already there.
apt update
apt install -y python3-venv python3-pip git tmux 7zip 7zip-standalone libmariadb-dev pkg-config
docker --version && docker compose version

# Embedding model, on the host (not in Docker)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull bge-m3

# Firewall: SSH only
ufw allow OpenSSH && ufw enable

```

Notes from setting this up on Linux (the organizers' scripts were written on a Mac):

- `libmariadb-dev` is required, or `pip install mariadb` fails with *"MariaDB Connector/C ... not found"*.
- The SVT setup needs the command `7zz`. On Ubuntu it comes from `7zip-standalone`. If that package is missing, link it: `ln -s "$(which 7z)" /usr/local/bin/7zz`.
- **Docker bypasses ufw.** A published port like `"3307:3306"` is open to the internet even with the firewall on. Always bind to localhost (next step).
- Stop any preinstalled containers you don't need (`docker ps`); some VPS templates expose ports publicly.

### 2. The organizers' demos (databases + data)

```bash
cd ~
git clone https://github.com/MariaDB/mariadb-vector-wikipedia-rag.git
git clone https://github.com/MariaDB/mariadb-system-versioning-wikipedia.git

# Bind both databases to localhost only
sed -i 's/"3307:3306"/"127.0.0.1:3307:3306"/' mariadb-vector-wikipedia-rag/docker-compose.yml
sed -i 's/"3308:3306"/"127.0.0.1:3308:3306"/' mariadb-system-versioning-wikipedia/docker-compose.yml

# RAG: ~5 min (ready-made vectors, no embedding)
(cd mariadb-vector-wikipedia-rag && ./setup.sh)

# SVT: downloads ~3.4 GB of dumps, then ~20 min of loading on 2 vCPU
tmux new -d -s svt 'cd ~/mariadb-system-versioning-wikipedia && ./setup.sh; bash'

```

Check:

```bash
cd ~/mariadb-vector-wikipedia-rag && .venv/bin/python search.py "Which peace treaty ended the Winter War?"
cd ~/mariadb-system-versioning-wikipedia && .venv/bin/python asof.py Talvisota 2010-01-01

```

### 3. Optional: all of dataset M (run overnight)

```bash
cd ~/mariadb-system-versioning-wikipedia
tmux new -d -s full '.venv/bin/python download.py --all && .venv/bin/python load.py --list data/articles-all.tsv; bash'

```

~19,750 articles, ~862,000 versions, plan 5–7 GB in MariaDB and several hours on 2 vCPU. Safe to stop and run again.

### 4. Run things in the background

```bash
tmux new -d -s NAME 'command'     # start detached
tmux ls                           # list
tmux attach -t NAME               # look (leave with Ctrl+B, then D)
tmux kill-session -t NAME         # stop

```

Always use the one-line `tmux new -d -s NAME 'command'` form. Pasting commands after an interactive `tmux new` does not run them inside the session.

### 5. Open it from your laptop

```bash
ssh -L 8000:localhost:8000 -L 8001:localhost:8001 root@<VPS_IP>

```

Then open [`http://localhost:8000`](http://localhost:8000) and [`http://localhost:8001`](http://localhost:8001). Use SSH keys (`ssh-copy-id root@<VPS_IP>`) rather than a password.

---

## Project structure (planned)

```
wikimemory/
├── README.md
├── CONTEXT.md            # facts and rules for AI coding assistants (below)
├── scripts/
│   ├── umap_coords.py    # vectors (Parquet) → UMAP 3D → table article_coord
│   ├── article_stats.py  # versions, reverts, disputes, edit-war months per article
│   └── drift_embed.py    # yearly snapshots → clean() → bge-m3 → table drift_vector
├── backend/
│   ├── main.py           # FastAPI
│   ├── rag_common.py     # copied from mariadb-vector-wikipedia-rag/common.py
│   ├── svt_common.py     # copied from mariadb-system-versioning-wikipedia/common.py
│   └── history.py        # copied from mariadb-system-versioning-wikipedia/history.py
└── frontend/
    └── index.html        # three.js galaxy, search, time slider

```

### Planned API


| Endpoint                        | Returns                                                         |
| ------------------------------- | --------------------------------------------------------------- |
| `GET /stars`                    | every article: `lang, page_id, wikidata_id, title, x, y, z`     |
| `GET /search?q=&lang=`          | top matches, with distance and other-language versions          |
| `GET /ask?q=`                   | LLM answer with numbered sources                                |
| `GET /timeline/{page_id}`       | edits, reverts and disputes per month                           |
| `GET /asof/{page_id}?date=`     | the article as it stood on that date, cleaned                   |
| `GET /diff/{page_id}?from=&to=` | changes between two dates                                       |
| `GET /year/{year}`              | per-article state for the slider: exists, length, edit-war flag |


---

## Roadmap

1. **Coordinates:** UMAP of the 29,460 vectors into 3D, stored in `article_coord`.
2. **API:** the endpoints above, reusing the organizers' helper code.
3. **Frontend:** galaxy, search with camera fly-to, article panel with timeline and slider.
4. **Ask:** LLM answer with cited sources.
5. **Wow, if time allows:** edit wars in 3D → semantic drift → chunking with measured before/after results (37 test questions, [`evaluate.py`](http://evaluate.py)).

Phases 1–4 make a complete submission. Phase 5 is extra. Commit after every phase.

---

## Technical notes

These come from reading the organizers' code and from measurements in their READMEs.

**Vector search**

- The vector query must be a subquery on `article_vector` alone (`ORDER BY VEC_DISTANCE_COSINE(...) LIMIT n`), joined to `article` outside. A flat join reads ~22,000 rows instead of ~200 and is ~50× slower.
- `SET mhnsw_ef_search = 80` per session. The index is built with `M=16`. With the defaults, recall@10 was only 79%.
- Embed questions with the same model (bge-m3) and always pass Ollama `{"num_ctx": 8192, "num_batch": 8192}`.
- One vector per article finds the *topic*, not the *fact*: "Who was president 1956–1982?" misses Kekkonen. Chunking is the fix.
- `FULLTEXT` has no Finnish stemming: every word form is a different search.

**System-versioned tables**

- Wikipedia's real edit times are written with `system_versioning_insert_history = 1`, so `FOR SYSTEM_TIME AS OF` means "what Wikipedia showed then".
- Every session: `SET time_zone = '+00:00'`. A prepared `TIMESTAMP ?` needs a full `YYYY-MM-DD HH:MM:SS`.
- `KEY (page_id, row_start)` already exists; it makes "as of" fast for old dates.
- **Revert:** a version whose `sha1` differs from the previous one but equals an earlier one. **Dispute:** a revert that undid a named user (not an IP or a `~2026-…` temporary account). **Edit war:** a month with ≥ 3 disputes.
- Old versions exist only as raw wikitext; `history.clean()` turns it into readable paragraphs.
- Computing stats over all history is slow at scale: precompute `article_stats` once.

---

## [CONTEXT.md](http://CONTEXT.md) (for AI coding assistants)

```markdown
# wikimemory — context
Product: 3D galaxy of Finnish-history Wikipedia articles + time slider (SVT) + grounded Q&A (RAG).
VPS: Ubuntu 24.04, 2 vCPU, 8 GB RAM + 4 GB swap, no GPU. Python 3.12. FastAPI for the API.

## Databases (both bound to 127.0.0.1)
- RAG 3307, db/user/pass wikirag: article(lang,page_id,rev_id,wikidata_id,title,url,date_modified,text),
  article_vector(lang,page_id,model,truncated,embedding VECTOR(1024)), category_link(parent,child),
  article_category(lang,page_id,category). 29,460 articles fi/sv/en.
- SVT 3308, db/user/pass wikihistory: article WITH SYSTEM VERSIONING (page_id PK, title, rev_id, user,
  comment, minor, sha1, len, text MEDIUMTEXT COMPRESSED, row_start/row_end INVISIBLE), article_list.
- Join: SVT page_id = RAG page_id where lang='fi'.
- Ollama 127.0.0.1:11434, model bge-m3, options {"num_ctx": 8192, "num_batch": 8192}.

## Reuse, don't rewrite
- ~/mariadb-vector-wikipedia-rag/common.py: connect(), embed(), search(), other_languages()
- ~/mariadb-system-versioning-wikipedia/history.py: as_of(), versions() (is_revert, undid_anonymous), clean()
- Both repos have common.py: copy as rag_common.py / svt_common.py.
- Vectors for UMAP: ~/mariadb-vector-wikipedia-rag/data/vectors-bge-m3-{fi,sv,en}.parquet
  (lang, page_id, model, truncated, embedding list<float32>[1024]).

## Rules
- Vector search = subquery on article_vector, ORDER BY VEC_DISTANCE_COSINE(embedding, VEC_FromText(?)) LIMIT n,
  then JOIN article. SET mhnsw_ef_search = 80.
- SVT: SET time_zone = '+00:00'; FOR SYSTEM_TIME AS OF TIMESTAMP 'YYYY-MM-DD HH:MM:SS'.
- Edit war = month with >= 3 reverts where undid_anonymous = 0.
- Precompute stats; never run ARTICLES_SQL live for thousands of articles.
- Bind every server to 127.0.0.1. Never expose DB ports.

```

---

## Credits and licence

- Data: Wikipedia, under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Every result links back to its article or version (`?curid=` / `?oldid=`). Anything derived from the text, including vectors and coordinates, is shared under the same licence.
- Datasets and reference code: [MariaDB Foundation](https://mariadb.org/) (Robert Silén), MIT licence: [mariadb-wikipedia-datasets](https://github.com/MariaDB/mariadb-wikipedia-datasets), [mariadb-vector-wikipedia-rag](https://github.com/MariaDB/mariadb-vector-wikipedia-rag), [mariadb-system-versioning-wikipedia](https://github.com/MariaDB/mariadb-system-versioning-wikipedia). Files copied from them keep their licence notice.
- Embedding model: [BAAI/bge-m3](https://huggingface.co/BAAI/bge-m3) via [Ollama](https://ollama.com/).