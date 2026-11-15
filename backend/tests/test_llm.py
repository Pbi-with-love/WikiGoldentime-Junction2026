import json
import threading
import time

import requests

from backend import llm

from backend import summary
from backend.llm import VerdaClient, llm_configured


class _Resp:
    status_code = 200
    headers: dict = {}

    def __init__(self, content, finish="stop"):
        self._d = {"choices": [{"message": {"content": content}, "finish_reason": finish}],
                   "usage": {"prompt_tokens": 7, "completion_tokens": 3}}

    def raise_for_status(self):
        pass

    def json(self):
        return self._d


def _client(content, finish="stop", seen=None):
    def post(url, headers, json, timeout):
        if seen is not None:
            seen.update(url=url, headers=headers, body=json)
        return _Resp(content, finish)
    return VerdaClient(post=post)


def test_adapter_maps_request_and_response(monkeypatch):
    monkeypatch.setenv("VERDA_API_KEY", "k")
    seen = {}
    c = _client('{"a": 1}', seen=seen)
    parsed, i, o = summary._call_llm_json(c, "claude-x", {"type": "object"}, "hi", system_prompt="sys")
    assert parsed == {"a": 1} and (i, o) == (7, 3)
    assert seen["url"].endswith("/chat/completions") and seen["headers"]["Authorization"] == "Bearer k"
    assert seen["body"]["model"] == "deepseek-4-1-flash-1017"
    assert seen["body"]["messages"][0]["role"] == "system" and seen["body"]["messages"][1] == {"role": "user", "content": "hi"}


def test_fenced_json_tolerated(monkeypatch):
    monkeypatch.setenv("VERDA_API_KEY", "k")
    parsed, _, _ = summary._call_llm_json(_client('```json\n{"a": 2}\n```'), "m", {}, "hi")
    assert parsed == {"a": 2}


def test_truncated_returns_none(monkeypatch):
    monkeypatch.setenv("VERDA_API_KEY", "k")
    parsed, _, _ = summary._call_llm_json(_client('{"a":', finish="length"), "m", {}, "hi")
    assert parsed is None


def test_llm_configured(monkeypatch):
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    monkeypatch.delenv("VERDA_API_KEY", raising=False)
    assert not llm_configured()
    monkeypatch.setenv("VERDA_API_KEY", "k")
    assert llm_configured()


class _Err(_Resp):
    def __init__(self, status, retry_after=None):
        super().__init__("")
        self.status_code = status
        self.headers = {"Retry-After": retry_after} if retry_after else {}

    def raise_for_status(self):
        raise requests.HTTPError(str(self.status_code), response=self)


def _seq(items):
    calls = []

    def post(url, headers, json, timeout):
        calls.append(1)
        it = items[len(calls) - 1]
        if isinstance(it, Exception):
            raise it
        return it
    return VerdaClient(post=post), calls


def test_retry_429_honours_retry_after_then_succeeds(monkeypatch):
    monkeypatch.setenv("VERDA_API_KEY", "k")
    sleeps = []
    monkeypatch.setattr(llm, "_sleep", sleeps.append)
    c, calls = _seq([_Err(429, "13"), _Err(503), requests.Timeout(), _Resp("ok")])
    assert c.messages.create(messages=[{"role": "user", "content": "x"}]).content[0].text == "ok"
    assert len(calls) == 4 and 13 <= sleeps[0] < 14 and 2 <= sleeps[1] < 3 and 4 <= sleeps[2] < 5


def test_gives_up_after_max_retries(monkeypatch):
    monkeypatch.setenv("VERDA_API_KEY", "k")
    monkeypatch.setattr(llm, "_sleep", lambda s: None)
    c, calls = _seq([_Err(429)] * 4)
    try:
        c.messages.create(messages=[{"role": "user", "content": "x"}])
        raise AssertionError("expected HTTPError path")
    except AssertionError:
        raise
    except Exception:
        pass
    assert len(calls) == 4


def test_no_retry_on_4xx(monkeypatch):
    monkeypatch.setenv("VERDA_API_KEY", "k")
    c, calls = _seq([_Err(400)])
    try:
        c.messages.create(messages=[{"role": "user", "content": "x"}])
    except Exception:
        pass
    assert len(calls) == 1


def test_semaphore_caps_concurrency(monkeypatch):
    monkeypatch.setenv("VERDA_API_KEY", "k")
    monkeypatch.setenv("VERDA_MAX_CONCURRENCY", "2")
    monkeypatch.setattr(llm, "_sem", None)
    live = peak = 0
    lock = threading.Lock()

    def post(url, headers, json, timeout):
        nonlocal live, peak
        with lock:
            live += 1
            peak = max(peak, live)
        time.sleep(0.05)
        with lock:
            live -= 1
        return _Resp("ok")
    c = VerdaClient(post=post)
    ts = [threading.Thread(target=c.messages.create, kwargs={"messages": [{"role": "user", "content": "x"}]}) for _ in range(8)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert peak == 2
