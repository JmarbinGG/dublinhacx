"""The one place that talks to the LLM (Qwen, served behind any
OpenAI-compatible API: vLLM, Ollama, DashScope...).

    LLM_SERVICE_URL   base URL, e.g. http://localhost:11434/v1 (Ollama)
    LLM_MODEL         the big model, default "qwen2.5"
    SMALL_LLM_MODEL   the small/fast model (query routing, refine); defaults to LLM_MODEL
    LLM_API_KEY       optional bearer token
    AI_TIMEOUT_S      per-call timeout, default 12
    LLM_JSON_MODE     1 = send response_format json_object (off: Featherless returns
                      empty output with it; the prompts ask for JSON anyway)
    LLM_THINKING      1 = let Qwen3 "think" first. Off by default: thinking makes
                      calls 10-20x slower and can eat the whole token budget

Keys, model name and prompts never leave the server. Callers get a validated
pydantic object back, or LLMError - never raw model text."""

import json
import logging
import os
import re
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from typing import Optional, TypeVar

import requests
from pydantic import BaseModel, ValidationError

import limits
from textutil import redact

log = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

AI_TIMEOUT_S = float(os.getenv("AI_TIMEOUT_S", "12"))

# Runs the HTTP call so we can enforce a total deadline: requests' own timeout
# is per read, and some providers send headers fast then stall on the body.
_POOL = ThreadPoolExecutor(max_workers=8, thread_name_prefix="llm")
MAX_OUTPUT_TOKENS = 400


class LLMError(Exception):
    """Unavailable, over budget, timed out, or returned something invalid.
    The message is for server logs only - never send it to the client.
    `invalid` = the model answered but the answer was unusable (worth trying
    another call); otherwise the service itself is the problem."""

    def __init__(self, message: str, invalid: bool = False):
        super().__init__(message)
        self.invalid = invalid


def configured() -> bool:
    return bool(os.getenv("LLM_SERVICE_URL"))


def big_model() -> str:
    return os.getenv("LLM_MODEL", "qwen2.5")


def small_model() -> str:
    return os.getenv("SMALL_LLM_MODEL") or big_model()


def estimate_tokens(messages: list[dict], max_tokens: int = MAX_OUTPUT_TOKENS) -> int:
    return sum(len(m["content"]) for m in messages) // 4 + max_tokens


_THINK_RE = re.compile(r"<think>.*?(</think>|$)", re.DOTALL)


def _extract_json(text: str) -> dict:
    """Models sometimes wrap JSON in ```json fences, add a sentence around it,
    or (Qwen3) prefix a <think>...</think> block."""
    text = _THINK_RE.sub("", text).strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1)
    elif not text.startswith("{"):
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end <= start:
            raise ValueError("no JSON object in reply")
        text = text[start : end + 1]
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("reply is not a JSON object")
    return data


def _body(messages: list[dict], model: str, max_tokens: int) -> dict:
    body = {"model": model, "messages": messages, "temperature": 0.2, "max_tokens": max_tokens, "stream": False}
    if os.getenv("LLM_JSON_MODE") == "1":
        body["response_format"] = {"type": "json_object"}
    if os.getenv("LLM_THINKING") != "1":
        body["chat_template_kwargs"] = {"enable_thinking": False}  # Qwen3 on vLLM-style servers
    return body


def complete_json(
    messages: list[dict],
    schema: type[T],
    timeout: Optional[float] = None,
    model: Optional[str] = None,
    max_tokens: int = MAX_OUTPUT_TOKENS,
) -> tuple[T, int]:
    """Send `messages`, parse the reply as JSON and validate it against
    `schema`. Returns (parsed, tokens_used). `model` defaults to the big one."""
    url = os.getenv("LLM_SERVICE_URL")
    if not url:
        raise LLMError("LLM_SERVICE_URL unset")

    estimated = estimate_tokens(messages, max_tokens)
    if not limits.reserve_llm_call(estimated):
        raise LLMError("daily AI budget spent")

    headers = {}
    if os.getenv("LLM_API_KEY"):
        headers["Authorization"] = f"Bearer {os.getenv('LLM_API_KEY')}"
    deadline = min(timeout or AI_TIMEOUT_S, AI_TIMEOUT_S)

    def post():
        resp = requests.post(
            f"{url.rstrip('/')}/chat/completions",
            json=_body(messages, model or big_model(), max_tokens),
            headers=headers,
            timeout=(5, deadline + 5),  # backstop; the future's deadline is what counts
        )
        resp.raise_for_status()
        return resp.json()

    try:
        body = _POOL.submit(post).result(timeout=deadline)
        content = body["choices"][0]["message"]["content"] or ""
        used = (body.get("usage") or {}).get("total_tokens")
    except FutureTimeout:
        raise LLMError(f"LLM call exceeded {deadline:.0f}s") from None
    except (requests.RequestException, ValueError, KeyError, IndexError, TypeError) as e:
        raise LLMError(f"LLM call failed: {type(e).__name__}: {redact(str(e))[:300]}") from None

    limits.record_llm_tokens(estimated, used)
    try:
        return schema.model_validate(_extract_json(content)), used or estimated
    except (ValueError, ValidationError) as e:
        log.info("LLM reply rejected: %s | %s", type(e).__name__, redact(content)[:300])
        raise LLMError("LLM returned invalid output", invalid=True) from None
