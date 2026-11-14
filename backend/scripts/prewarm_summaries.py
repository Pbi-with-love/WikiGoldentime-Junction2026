"""Pre-warm wikirag.summary_cache synchronously for selected demo articles."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys
import time

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend import summary  # noqa: E402

DEFAULT_PAGES = ["fi:1256", "fi:1150", "fi:440"]


def _parse_pages(raw_pages: list[str]) -> list[tuple[str, int]]:
    items: list[tuple[str, int]] = []
    for chunk in raw_pages:
        for part in chunk.split(","):
            token = part.strip()
            if not token:
                continue
            if ":" not in token:
                raise ValueError(f"Expected lang:page_id, got {token!r}")
            lang, pid_str = token.split(":", 1)
            items.append((lang.strip(), int(pid_str.strip())))
    return items


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Pre-warm wikirag.summary_cache")
    parser.add_argument(
        "--pages",
        nargs="+",
        default=DEFAULT_PAGES,
        help="Article specs as lang:page_id (space or comma separated)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Rebuild and overwrite existing cache entries",
    )
    args = parser.parse_args(argv)

    targets = _parse_pages(args.pages)
    summary.ensure_cache_table()

    total_failed = 0
    for lang, page_id in targets:
        t0 = time.perf_counter()
        payload, stats, from_cache = summary.build_and_cache_llm_summary(
            lang=lang,
            page_id=page_id,
            force=args.force,
        )
        elapsed = time.perf_counter() - t0
        title = payload["article"]["title"]
        rev_id = payload["rev_id"]
        status = "cached-hit" if from_cache else "built"
        total_failed += stats.failed_calls
        print(
            f"{lang}:{page_id} ({title}) rev={rev_id} [{status}]: "
            f"sections={stats.sections} ghosts={stats.ghosts} "
            f"facts_kept={stats.facts_kept} facts_dropped={stats.facts_dropped} "
            f"failed_calls={stats.failed_calls} seconds={elapsed:.2f} "
            f"input_tokens={stats.input_tokens} output_tokens={stats.output_tokens}",
            flush=True,
        )

    return 1 if total_failed > 0 else 0


if __name__ == "__main__":
    raise SystemExit(main())
