"""Verda inference (OpenAI-compatible Chat Completions) behind the Anthropic `client.messages.create` interface."""
from __future__ import annotations

import json
import logging
import os
import random
import threading
import time
from types import SimpleNamespace
from typing import Any

import requests

logger = logging.getLogger(__name__)
_MAX_RETRIES = 3
_sem: threading.BoundedSemaphore | None = None
_sleep = time.sleep  # patched in tests


def _semaphore() -> threading.BoundedSemaphore:
    global _sem
    if _sem is None:
        _sem = threading.BoundedSemaphore(int(os.environ.get("VERDA_MAX_CONCURRENCY", "4")))
    return _sem


def _post_with_retry(post: Any, url: str, **kw: Any) -> Any:
    """POST under the concurrency cap; retry 429/5xx/connection errors with backoff (Retry-After wins, capped 30 s)."""
    for attempt in range(_MAX_RETRIES + 1):
        retry_after = None
        try:
            with _semaphore():
                r = post(url, **kw)
            status = r.status_code
            if status != 429 and status < 500:
                return r
            try:
                retry_after = float(r.headers.get("Retry-After"))
            except (TypeError, ValueError, AttributeError):
                pass
        except (requests.ConnectionError, requests.Timeout) as exc:
            r, status = None, type(exc).__name__
        if attempt == _MAX_RETRIES:
            logger.warning("Verda call failed status=%s attempt=%d/%d, giving up", status, attempt + 1, _MAX_RETRIES + 1)
            if r is None:
                raise
            return r
        delay = min(retry_after, 30.0) if retry_after is not None else 2.0**attempt
        delay += random.uniform(0, 1)
        logger.warning("Verda call status=%s attempt=%d/%d, retry in %.1fs", status, attempt + 1, _MAX_RETRIES + 1, delay)
        _sleep(delay)
    raise AssertionError("unreachable")


def llm_configured() -> bool:
    if os.environ.get("LLM_PROVIDER") == "anthropic":
        return bool(os.environ.get("ANTHROPIC_API_KEY"))
    return bool(os.environ.get("VERDA_API_KEY"))


class _Messages:
    def __init__(self, post: Any) -> None:
        self._post = post

    def create(self, **kw: Any) -> Any:
        system = kw.get("system") or ""
        schema = (kw.get("output_config") or {}).get("format", {}).get("schema")
        if schema:  # deepseek does not enforce json_schema: state it in the system prompt
            system += "\n\nReply with ONLY one JSON object (no code fences, no extra text) matching this JSON schema:\n" + json.dumps(schema)
        body: dict[str, Any] = {
            "model": os.environ.get("VERDA_MODEL", "deepseek-4-1-flash-1017"),
            "max_tokens": kw.get("max_tokens", 4000),
            "messages": ([{"role": "system", "content": system}] if system else []) + list(kw["messages"]),
        }
        if "temperature" in kw:
            body["temperature"] = kw["temperature"]
        r = _post_with_retry(
            self._post,
            os.environ.get("VERDA_BASE_URL", "https://inference.verda.com/v1").rstrip("/") + "/chat/completions",
            headers={"Authorization": "Bearer " + os.environ["VERDA_API_KEY"]},
            json=body,
            timeout=120,
        )
        r.raise_for_status()
        data = r.json()
        choice = data["choices"][0]
        usage = data.get("usage") or {}
        return SimpleNamespace(
            content=[SimpleNamespace(type="text", text=choice["message"].get("content") or "")],
            stop_reason="end_turn" if choice.get("finish_reason") in ("stop", None) else "max_tokens",
            usage=SimpleNamespace(
                input_tokens=usage.get("prompt_tokens", 0), output_tokens=usage.get("completion_tokens", 0)
            ),
        )


class VerdaClient:
    def __init__(self, post: Any = requests.post) -> None:
        self.messages = _Messages(post)
