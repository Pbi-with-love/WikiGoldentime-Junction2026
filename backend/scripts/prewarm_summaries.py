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


def _parse_ui_langs(raw_ui: list[str] | None) -> list[str | None]:
    if not raw_ui:
        return [None]
    langs: list[str | None] = []
    for chunk in raw_ui:
        for part in chunk.split(","):
            token = part.strip()
            if not token:
                continue
            if token not in summary.VALID_LANGS:
                raise ValueError(f"Invalid --ui language {token!r}; expected fi, sv, or en")
            if token not in langs:
                langs.append(token)
    return langs or [None]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Pre-warm wikirag.summary_cache")
    parser.add_argument(
        "--pages",
        nargs="+",
        default=DEFAULT_PAGES,
        help="Article specs as lang:page_id (space or comma separated)",
    )
    parser.add_argument(
        "--ui",
        nargs="+",
        default=None,
        help="Optional output UI languages (fi, sv, en; space or comma separated)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Rebuild and overwrite existing cache entries",
    )
    args = parser.parse_args(argv)

    targets = _parse_pages(args.pages)
    ui_langs = _parse_ui_langs(args.ui)
    summary.ensure_cache_table()

    NEVER_FORCE_FI_DEFAULTS = {1256, 1150, 440}

    total_failed = 0
    for lang, page_id in targets:
        for ui_lang in ui_langs:
            t0 = time.perf_counter()
            if ui_lang is not None and ui_lang != lang:
                # Always ensure the requested article's default row exists without forcing it
                summary.build_and_cache_llm_summary(
                    lang=lang,
                    page_id=page_id,
                    force=False,
                    ui=None,
                )
                sibling_pid = summary.find_native_sibling(lang, page_id, ui_lang)
                if sibling_pid is not None:
                    force_sib = bool(
                        args.force and not (ui_lang == "fi" and sibling_pid in NEVER_FORCE_FI_DEFAULTS)
                    )
                    payload, stats, from_cache = summary.build_and_cache_llm_summary(
                        lang=ui_lang,
                        page_id=sibling_pid,
                        force=force_sib,
                        ui=None,
                    )
                    mode_tag = f"native {ui_lang}:{sibling_pid}"
                else:
                    payload, stats, from_cache = summary.build_and_cache_llm_summary(
                        lang=lang,
                        page_id=page_id,
                        force=args.force,
                        ui=ui_lang,
                    )
                    mode_tag = "translated"
            else:
                force_def = bool(
                    args.force and not (lang == "fi" and page_id in NEVER_FORCE_FI_DEFAULTS)
                )
                payload, stats, from_cache = summary.build_and_cache_llm_summary(
                    lang=lang,
                    page_id=page_id,
                    force=force_def,
                    ui=None,
                )
                mode_tag = "default"
            elapsed = time.perf_counter() - t0
            title = payload["article"]["title"]
            rev_id = payload["rev_id"]
            status = "cached-hit" if from_cache else "built"
            total_failed += stats.failed_calls
            ui_tag = ui_lang or "-"
            print(
                f"{lang}:{page_id} ui={ui_tag} [{mode_tag}] ({title}) rev={rev_id} [{status}]: "
                f"sections={stats.sections} ghosts={stats.ghosts} "
                f"facts_kept={stats.facts_kept} facts_dropped={stats.facts_dropped} "
                f"calls={stats.total_calls} failed_calls={stats.failed_calls} "
                f"strings={stats.translate_strings} fallbacks={stats.translate_fallbacks} "
                f"seconds={elapsed:.2f} "
                f"input_tokens={stats.input_tokens} output_tokens={stats.output_tokens}",
                flush=True,
            )

    return 1 if total_failed > 0 else 0


if __name__ == "__main__":
    raise SystemExit(main())
