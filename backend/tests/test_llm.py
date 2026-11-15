import json

from backend import summary
from backend.llm import VerdaClient, llm_configured


class _Resp:
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
