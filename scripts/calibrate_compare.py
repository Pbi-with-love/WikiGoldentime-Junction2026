"""Calibration and evaluation script for Spec 017 cross-language compare.

Runs read-only against MariaDB wikirag on the VPS:
1. Selects 3 demo fi articles (1256, 1150, 440) + 20 deterministic non-short fi articles
   with both sv and en siblings (ORDER BY CRC32(page_id)).
2. Asserts chunk.rev_id == article.rev_id for all sample and sibling articles.
3. Optionally dumps blind text (without distances) for hand labelling.
4. Writes artifacts/017-compare/calibration.tsv (sibling + unrelated random baseline).
5. If data/compare_labels.tsv is present, prints histogram, precision/recall/F1 tables,
   intro share, and passage_ok stats, and writes artifacts/017-compare/calibration.md.
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path
import sys
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend import compare, rag_common, summary  # noqa: E402

DEMO_PAGE_IDS = [1256, 1150, 440]
CANDIDATES_SQL = """
SELECT fi.page_id, fi.rev_id, fi.wikidata_id, fi.title, fi.url, fi.text,
       sv.page_id AS sv_page_id, sv.rev_id AS sv_rev_id, sv.title AS sv_title, sv.url AS sv_url,
       en.page_id AS en_page_id, en.rev_id AS en_rev_id, en.title AS en_title, en.url AS en_url
FROM wikirag.article fi
JOIN wikirag.article sv
  ON sv.lang = 'sv' AND sv.wikidata_id = fi.wikidata_id
JOIN wikirag.article en
  ON en.lang = 'en' AND en.wikidata_id = fi.wikidata_id
WHERE fi.lang = 'fi'
  AND fi.wikidata_id IS NOT NULL
  AND fi.page_id NOT IN (1256, 1150, 440)
  AND CHAR_LENGTH(fi.text) >= 6000
ORDER BY CRC32(fi.page_id), sv.page_id, en.page_id
"""

DEMO_SQL = """
SELECT fi.page_id, fi.rev_id, fi.wikidata_id, fi.title, fi.url, fi.text,
       sv.page_id AS sv_page_id, sv.rev_id AS sv_rev_id, sv.title AS sv_title, sv.url AS sv_url,
       en.page_id AS en_page_id, en.rev_id AS en_rev_id, en.title AS en_title, en.url AS en_url
FROM wikirag.article fi
JOIN wikirag.article sv
  ON sv.lang = 'sv' AND sv.wikidata_id = fi.wikidata_id
JOIN wikirag.article en
  ON en.lang = 'en' AND en.wikidata_id = fi.wikidata_id
WHERE fi.lang = 'fi' AND fi.page_id IN (1256, 1150, 440)
ORDER BY FIELD(fi.page_id, 1256, 1150, 440), sv.page_id, en.page_id
"""


def select_sample_articles(cur, extra_count: int = 20) -> list[dict[str, Any]]:
    """Select the 3 demo articles + 20 deterministic non-short fi articles with sv+en siblings."""
    samples: list[dict[str, Any]] = []
    seen_fi: set[int] = set()

    def _collect(rows: list[tuple[Any, ...]], limit: int | None = None) -> None:
        for row in rows:
            fi_pid = int(row[0])
            if fi_pid in seen_fi:
                continue
            text = str(row[5])
            words = summary.count_words(text)
            _, kept, _ = summary.split_markdown_sections(text)
            if words < compare.SHORT_ARTICLE_MIN_WORDS or len(kept) < compare.SHORT_ARTICLE_MIN_SECTIONS:
                continue
            seen_fi.add(fi_pid)
            samples.append(
                {
                    "page_id": fi_pid,
                    "rev_id": int(row[1]),
                    "wikidata_id": row[2],
                    "title": str(row[3]),
                    "url": str(row[4]),
                    "words": words,
                    "kept_sections": kept,
                    "siblings": {
                        "sv": {"page_id": int(row[6]), "rev_id": int(row[7]), "title": str(row[8]), "url": str(row[9])},
                        "en": {"page_id": int(row[10]), "rev_id": int(row[11]), "title": str(row[12]), "url": str(row[13])},
                    },
                }
            )
            if limit is not None and len(samples) >= limit:
                break

    cur.execute(DEMO_SQL)
    _collect(cur.fetchall())
    cur.execute(CANDIDATES_SQL)
    _collect(cur.fetchall(), limit=len(DEMO_PAGE_IDS) + extra_count)
    return samples


def verify_chunk_rev_ids(cur, samples: list[dict[str, Any]]) -> list[str]:
    """Assert chunk.rev_id == article.rev_id for all sample fi articles and their siblings."""
    mismatches: list[str] = []
    pairs: list[tuple[str, int, int]] = []
    for s in samples:
        pairs.append(("fi", s["page_id"], s["rev_id"]))
        for sib_lang in ("sv", "en"):
            sib = s["siblings"][sib_lang]
            pairs.append((sib_lang, sib["page_id"], sib["rev_id"]))

    for lang, pid, expected_rev in pairs:
        cur.execute(
            "SELECT DISTINCT rev_id FROM wikirag.chunk WHERE lang = ? AND page_id = ?",
            (lang, pid),
        )
        revs = [int(r[0]) for r in cur.fetchall()]
        if revs != [expected_rev]:
            mismatches.append(f"{lang}:{pid} article.rev_id={expected_rev} chunk.rev_id={revs}")
    return mismatches


def dump_blind_texts(cur, samples: list[dict[str, Any]], page_ids: list[int], out_path: Path) -> None:
    """Dump fi section excerpts and sibling headings/excerpts WITHOUT distances for blind labelling."""
    by_pid = {s["page_id"]: s for s in samples}
    lines: list[str] = []
    for pid in page_ids:
        s = by_pid.get(pid)
        if not s:
            continue
        lines.append(f"=== FI {pid}: {s['title']} ({len(s['kept_sections'])} sections) ===")
        for sib_lang in ("sv", "en"):
            sib = s["siblings"][sib_lang]
            cur.execute("SELECT text FROM wikirag.article WHERE lang = ? AND page_id = ?", (sib_lang, sib["page_id"]))
            sib_text = str(cur.fetchone()[0])
            lead, sib_secs, _ = summary.split_markdown_sections(sib_text)
            lines.append(f"\n--- Sibling {sib_lang}:{sib['page_id']} {sib['title']} (words={summary.count_words(sib_text)}) ---")
            lines.append(f"  [Lead]: {summary.normalize_ws(summary.strip_markdown(lead))[:350]}")
            for ss in sib_secs:
                snippet = summary.normalize_ws(summary.strip_markdown(ss["text"]))[:300]
                lines.append(f"  [{ss['no']}] {ss['heading']}: {snippet}")
        lines.append("\n--- Finnish sections ---")
        for sec in s["kept_sections"]:
            snippet = summary.normalize_ws(summary.strip_markdown(sec["text"]))[:350]
            lines.append(f"  [{sec['no']}] {sec['heading']}: {snippet}")
        lines.append("")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(lines), encoding="utf-8")


def compute_calibration_rows(
    cur, samples: list[dict[str, Any]], rule: str = "baseline"
) -> list[dict[str, Any]]:
    """Compute best distance, sibling section, and passage snippet for sibling and random pairs."""
    rows: list[dict[str, Any]] = []
    n = len(samples)

    # Preload fi chunk sections and all sibling chunks metadata
    fi_chunks_map: dict[int, dict[int, str | None]] = {}
    sib_chunks_map: dict[tuple[str, int], dict[int, tuple[str | None, str]]] = {}

    for s in samples:
        pid = s["page_id"]
        cur.execute(compare.FI_CHUNK_SECTIONS_SQL, (pid,))
        fi_chunks_map[pid] = {int(r[0]): r[1] for r in cur.fetchall()}
        for sib_lang in ("sv", "en"):
            sib_pid = s["siblings"][sib_lang]["page_id"]
            cur.execute(
                "SELECT chunk_no, section, text FROM wikirag.chunk WHERE lang = ? AND page_id = ?",
                (sib_lang, sib_pid),
            )
            sib_chunks_map[(sib_lang, sib_pid)] = {
                int(r[0]): (r[1], str(r[2])) for r in cur.fetchall()
            }

    for idx, s in enumerate(samples):
        pid = s["page_id"]
        other = samples[(idx + 1) % n]
        for pair_type, sib_source in (("sibling", s), ("random", other)):
            siblings_arg = {
                "sv": sib_source["siblings"]["sv"],
                "en": sib_source["siblings"]["en"],
            }
            distance_pairs: dict[str, list[tuple[int, int, float]]] = {}
            for sib_lang in ("sv", "en"):
                sib_pid = sib_source["siblings"][sib_lang]["page_id"]
                cur.execute(compare.PAIR_DISTANCES_SQL, (sib_lang, sib_pid, pid))
                distance_pairs[sib_lang] = [
                    (int(r[0]), int(r[1]), float(r[2])) for r in cur.fetchall()
                ]
            winners, _ = compare.compute_section_winners(
                kept_sections=s["kept_sections"],
                fi_chunk_sections=fi_chunks_map[pid],
                distance_pairs=distance_pairs,
                siblings=siblings_arg,
                article_page_id=pid,
                rule=rule,
                sib_chunk_sections={
                    sl: {c: v[0] for c, v in sib_chunks_map[(sl, sib_source["siblings"][sl]["page_id"])].items()}
                    for sl in ("sv", "en")
                },
            )
            for sec in s["kept_sections"]:
                sec_no = int(sec["no"])
                for sib_lang in ("sv", "en"):
                    sib_pid = sib_source["siblings"][sib_lang]["page_id"]
                    win = winners.get((sec_no, sib_lang))
                    if win is None:
                        continue
                    dist, win_cno = win
                    if win_cno < 0:
                        sib_sec_label = "<NONE>"
                        passage80 = ""
                    else:
                        sib_sec, sib_text = sib_chunks_map[(sib_lang, sib_pid)][win_cno]
                        sib_sec_label = sib_sec if sib_sec is not None else "<INTRO>"
                        passage80 = compare.format_passage(sib_text, max_chars=80).replace("\t", " ").replace("\n", " ")
                    rows.append(
                        {
                            "pair_type": pair_type,
                            "page_id": pid,
                            "title": s["title"],
                            "no": sec_no,
                            "heading": sec["heading"],
                            "sib_lang": sib_lang,
                            "sib_page_id": sib_pid,
                            "sib_chunks": len(sib_chunks_map[(sib_lang, sib_pid)]),
                            "distance": f"{dist:.3f}",
                            "sib_chunk_no": win_cno,
                            "sib_section": sib_sec_label,
                            "passage_80": passage80,
                        }
                    )
    return rows


def evaluate_labels(
    cal_rows: list[dict[str, Any]],
    labels_path: Path,
) -> dict[str, Any]:
    """Compute histogram, per-threshold precision/recall/F1, intro share, and passage_ok stats."""
    by_key: dict[tuple[int, int, str], dict[str, Any]] = {}
    random_dists: list[float] = []
    for r in cal_rows:
        if r["pair_type"] == "random":
            random_dists.append(float(r["distance"]))
        else:
            by_key[(int(r["page_id"]), int(r["no"]), str(r["sib_lang"]))] = r

    labelled: list[dict[str, Any]] = []
    with labels_path.open(encoding="utf-8") as fh:
        reader = csv.DictReader(fh, delimiter="\t")
        for row in reader:
            pid = int(row["page_id"])
            no = int(row["no"])
            sib_lang = row["lang"].strip()
            label = int(row["label"])
            cal = by_key.get((pid, no, sib_lang))
            if cal is None:
                continue
            labelled.append(
                {
                    "page_id": pid,
                    "no": no,
                    "lang": sib_lang,
                    "label": label,
                    "passage_ok": row.get("passage_ok", "").strip(),
                    "distance": float(cal["distance"]),
                    "sib_section": cal["sib_section"],
                    "sib_chunks": int(cal["sib_chunks"]),
                }
            )

    bins = [(round(i * 0.05, 2), round((i + 1) * 0.05, 2)) for i in range(16)]  # 0.00..0.80
    hist: list[dict[str, Any]] = []
    for lo, hi in bins:
        c1 = sum(1 for x in labelled if x["label"] == 1 and lo <= x["distance"] < hi)
        c0 = sum(1 for x in labelled if x["label"] == 0 and lo <= x["distance"] < hi)
        cr = sum(1 for d in random_dists if lo <= d < hi)
        hist.append({"bin": f"[{lo:.2f}, {hi:.2f})", "label1": c1, "label0": c0, "random": cr})

    def _metrics(items: list[dict[str, Any]], thr: float) -> dict[str, float]:
        tp = sum(1 for x in items if x["distance"] <= thr and x["label"] == 1)
        fp = sum(1 for x in items if x["distance"] <= thr and x["label"] == 0)
        fn = sum(1 for x in items if x["distance"] > thr and x["label"] == 1)
        prec = tp / (tp + fp) if (tp + fp) else 0.0
        rec = tp / (tp + fn) if (tp + fn) else 0.0
        f1 = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
        return {"tp": tp, "fp": fp, "fn": fn, "precision": prec, "recall": rec, "f1": f1}

    thresholds = [round(0.20 + i * 0.025, 3) for i in range(17)]
    sweep = []
    for thr in thresholds:
        overall = _metrics(labelled, thr)
        sv_m = _metrics([x for x in labelled if x["lang"] == "sv"], thr)
        en_m = _metrics([x for x in labelled if x["lang"] == "en"], thr)
        sweep.append({"threshold": thr, "overall": overall, "sv": sv_m, "en": en_m})

    for row in sweep:
        m = [x for x in labelled if x["distance"] <= row["threshold"] and x["label"] == 1 and x["passage_ok"] in ("0", "1")]
        row["passage_ok"] = sum(1 for x in m if x["passage_ok"] == "1") / len(m) if m else 0.0

    return {
        "labelled": labelled,
        "hist": hist,
        "sweep": sweep,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Calibrate cross-language compare threshold")
    parser.add_argument("--out", default="artifacts/017-compare", help="Output directory")
    parser.add_argument(
        "--dump-blind",
        default=None,
        help="Optional comma-separated page_ids to dump blind text for hand labelling",
    )
    parser.add_argument("--rules", default="baseline", help="Comma-separated rules (spec 027)")
    parser.add_argument("--labels", default="data/compare_labels.tsv", help="Path to hand labels TSV")
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    con = rag_common.connect()
    try:
        cur = con.cursor()
        try:
            samples = select_sample_articles(cur, extra_count=20)
            mismatches = verify_chunk_rev_ids(cur, samples)
            if mismatches:
                raise RuntimeError(f"chunk.rev_id != article.rev_id mismatches: {mismatches}")

            print(f"Selected {len(samples)} sample articles (0 rev_id mismatches):")
            for idx, s in enumerate(samples, 1):
                print(
                    f"  {idx:2d}. fi:{s['page_id']} {s['title']} "
                    f"(sections={len(s['kept_sections'])}, sv={s['siblings']['sv']['page_id']}, en={s['siblings']['en']['page_id']})"
                )

            if args.dump_blind:
                pids = [int(x.strip()) for x in args.dump_blind.split(",") if x.strip()]
                blind_path = out_dir / "blind_for_labelling.txt"
                dump_blind_texts(cur, samples, pids, blind_path)
                print(f"Wrote blind text to {blind_path}")
                return

            rules = [r.strip() for r in args.rules.split(",") if r.strip()]
            cal_by_rule = {r: compute_calibration_rows(cur, samples, r) for r in rules}
            cal_rows = cal_by_rule[rules[0]]
        finally:
            cur.close()
    finally:
        con.close()

    tsv_path = out_dir / "calibration.tsv"
    fieldnames = [
        "pair_type",
        "page_id",
        "title",
        "no",
        "heading",
        "sib_lang",
        "sib_page_id",
        "sib_chunks",
        "distance",
        "sib_chunk_no",
        "sib_section",
        "passage_80",
    ]
    with tsv_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames, delimiter="\t")
        writer.writeheader()
        writer.writerows(cal_rows)
    print(f"Wrote {len(cal_rows)} rows to {tsv_path}")

    labels_path = Path(args.labels)
    if labels_path.exists():
        for rule_name, rows_r in cal_by_rule.items():
            print(f"\n##### RULE {rule_name}")
            with (out_dir / f"calibration_{rule_name}.tsv").open("w", encoding="utf-8", newline="") as fh:
                w = csv.DictWriter(fh, fieldnames=fieldnames, delimiter="\t")
                w.writeheader()
                w.writerows(rows_r)
            ev = evaluate_labels(rows_r, labels_path)
            print("\nHistogram:")
            for b in ev["hist"]:
                print(f"  {b['bin']}  label1={b['label1']:3d}  label0={b['label0']:3d}  random={b['random']:3d}")
            print("\nThreshold sweep:")
            for row in ev["sweep"]:
                o = row["overall"]
                sv = row["sv"]
                en = row["en"]
                print(
                    f"  thr={row['threshold']:.3f}  "
                    f"P={o['precision']:.3f} R={o['recall']:.3f} F1={o['f1']:.3f} "
                    f"(sv P={sv['precision']:.3f} R={sv['recall']:.3f}; "
                    f"en P={en['precision']:.3f} R={en['recall']:.3f}) passage_ok={row['passage_ok']:.3f}"
                )


if __name__ == "__main__":
    main()
