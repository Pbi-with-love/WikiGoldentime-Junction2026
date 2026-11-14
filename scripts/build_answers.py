"""Pre-warm wikirag.answer_cache synchronously from a TSV question list."""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import csv
from pathlib import Path
import sys
import time
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend import ask  # noqa: E402


def _load_questions(tsv_path: Path) -> list[dict[str, str]]:
    with tsv_path.open("r", encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh, delimiter="\t")
        rows = [
            {
                "q": (row.get("q") or "").strip(),
                "expected_page_id": (row.get("expected_page_id") or "").strip(),
                "origin": (row.get("origin") or "").strip(),
            }
            for row in reader
        ]
    return [r for r in rows if r["q"]]


def _process_one(idx: int, total: int, row: dict[str, str], force: bool) -> dict[str, Any]:
    q = row["q"]
    origin = row["origin"]
    expected_pid = row["expected_page_id"]
    try:
        payload, stats = ask.build_and_cache_ask(q=q, force=force)
        top = payload["top"]
        ms_count = len(payload["milestones"])
        hist_avail = bool(payload["history_available"])

        if origin == "no-history":
            ok = (not hist_avail) and ms_count == 0
            note = "OK(no-history)" if ok else f"FAIL(expected no-history, got hist={hist_avail} ms={ms_count})"
        else:
            ok = hist_avail and top.get("lang") == "fi" and ms_count >= 2
            note = "OK" if ok else f"WARN(hist={hist_avail} top={top} ms={ms_count})"

        return {
            "idx": idx,
            "total": total,
            "q": q,
            "origin": origin,
            "expected_pid": expected_pid,
            "ok": ok,
            "error": None,
            "note": note,
            "top": f"{top['lang']}:{top['page_id']}",
            "match_exp": expected_pid.isdigit() and int(expected_pid) == int(top["page_id"]),
            "resolution": stats.history_resolution,
            "sql_mode": stats.sql_mode,
            "cached_hit": stats.cached_hit,
            "milestones": ms_count,
            "hist_calls": stats.history_llm_calls,
            "max_calls": stats.max_llm_calls,
            "windows_scanned": stats.windows_scanned,
            "versions_read": stats.versions_read,
            "sha1_cleaned": stats.sha1_cleaned,
            "reverted_later": stats.reverted_later,
            "scan_seconds": stats.scan_seconds,
            "cur_drop": stats.current_facts_dropped,
            "hist_drop": stats.history_facts_dropped,
            "failed_calls": stats.failed_calls,
            "in_tok": stats.input_tokens,
            "out_tok": stats.output_tokens,
            "elapsed": stats.elapsed_seconds,
        }
    except Exception as exc:
        return {
            "idx": idx,
            "total": total,
            "q": q,
            "origin": origin,
            "expected_pid": expected_pid,
            "ok": False,
            "error": f"{type(exc).__name__}: {exc}",
            "note": "ERROR",
            "top": "-",
            "match_exp": False,
            "resolution": "error",
            "sql_mode": "-",
            "cached_hit": False,
            "milestones": 0,
            "hist_calls": 0,
            "max_calls": 0,
            "windows_scanned": 0,
            "versions_read": 0,
            "sha1_cleaned": 0,
            "reverted_later": 0,
            "scan_seconds": 0.0,
            "cur_drop": 0,
            "hist_drop": 0,
            "failed_calls": 1,
            "in_tok": 0,
            "out_tok": 0,
            "elapsed": 0.0,
        }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Pre-warm wikirag.answer_cache from TSV questions")
    parser.add_argument(
        "--questions",
        default="data/demo-questions.tsv",
        help="Path to TSV file with columns: q<TAB>expected_page_id<TAB>origin",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Rebuild and overwrite existing cached entries",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=3,
        help="Concurrent question workers (default 3; history calls per question stay sequential)",
    )
    args = parser.parse_args(argv)

    tsv_path = Path(args.questions)
    if not tsv_path.is_absolute():
        tsv_path = (REPO_ROOT / tsv_path).resolve()
    questions = _load_questions(tsv_path)
    if not questions:
        print(f"No questions found in {tsv_path}", file=sys.stderr)
        return 1

    ask.ensure_answer_cache_table()
    t_all = time.perf_counter()
    results: list[dict[str, Any]] = []
    workers = max(1, int(args.workers))

    if workers == 1:
        for idx, row in enumerate(questions, start=1):
            res = _process_one(idx, len(questions), row, args.force)
            results.append(res)
            _print_row(res)
    else:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futs = {
                pool.submit(_process_one, idx, len(questions), row, args.force): idx
                for idx, row in enumerate(questions, start=1)
            }
            for fut in as_completed(futs):
                res = fut.result()
                results.append(res)
                _print_row(res)

    results.sort(key=lambda r: r["idx"])
    total_elapsed = time.perf_counter() - t_all
    errors = sum(1 for r in results if r["error"] is not None)
    not_ok = [r for r in results if not r["ok"]]
    direct_n = sum(1 for r in results if r["resolution"] == "direct")
    sibling_n = sum(1 for r in results if r["resolution"] == "sibling")
    none_n = sum(1 for r in results if r["resolution"] == "none")
    total_calls = sum(r["hist_calls"] + (0 if r["cached_hit"] else 1) for r in results)
    total_in = sum(r["in_tok"] for r in results)
    total_out = sum(r["out_tok"] for r in results)

    print(
        f"\nSUMMARY: total={len(results)} ok={len(results) - len(not_ok)} warn_or_fail={len(not_ok)} errors={errors} "
        f"direct={direct_n} sibling={sibling_n} no_history={none_n} "
        f"llm_calls={total_calls} tokens={total_in}+{total_out} wall={total_elapsed:.2f}s",
        flush=True,
    )
    for bad in not_ok:
        print(f"  ISSUE [{bad['idx']}] {bad['q']!r}: {bad['note']} err={bad['error']}", flush=True)

    return 1 if errors > 0 or len(not_ok) > 0 else 0


def _print_row(r: dict[str, Any]) -> None:
    src_tag = "CACHE" if r["cached_hit"] else "BUILD"
    print(
        f"[{r['idx']}/{r['total']}] {src_tag} origin={r['origin']} top={r['top']} "
        f"(exp={r['expected_pid']} match={r['match_exp']}) res={r['resolution']} sql={r['sql_mode']} "
        f"ms={r['milestones']} hist_calls={r['hist_calls']}/{r['max_calls']} "
        f"win={r['windows_scanned']} ver={r['versions_read']} sha={r['sha1_cleaned']} "
        f"rev_later={r['reverted_later']} scan={r['scan_seconds']:.2f}s "
        f"drop=cur:{r['cur_drop']}/hist:{r['hist_drop']} fail={r['failed_calls']} "
        f"tok={r['in_tok']}+{r['out_tok']} {r['elapsed']:.2f}s [{r['note']}] q={r['q']!r}",
        flush=True,
    )


if __name__ == "__main__":
    raise SystemExit(main())
