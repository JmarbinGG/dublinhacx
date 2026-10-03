"""In-memory rate limits and the daily AI budget. Per-process and reset on
restart - fine for one server at a hackathon; move to Redis if we scale out.

Every limit raises 429 with a Retry-After header (seconds)."""

import math
import os
import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, Request

from models import User


@dataclass(frozen=True)
class Limit:
    count: int
    window_s: int


HOUR = 3600

# name -> (signed-in per user, anonymous per IP). On top of that every IP has
# IP_CEILING per hour across all AI endpoints, so one person can't dodge the
# per-user limit with many accounts.
AI_LIMITS = {
    "search_ai": (Limit(20, HOUR), Limit(5, HOUR)),
    "assistant_session": (Limit(10, HOUR), Limit(3, HOUR)),
    "assistant_message": (Limit(60, HOUR), Limit(15, HOUR)),
    "assistant_report": (Limit(10, HOUR), Limit(5, HOUR)),
    "search": (Limit(120, 60), Limit(60, 60)),  # GET /api/search when the AI search service is on
}
IP_CEILING = Limit(200, HOUR)
UPLOAD_LIMIT = Limit(30, HOUR)

_hits: dict[str, deque] = defaultdict(deque)
_lock = threading.Lock()


def hit(key: str, limit: Limit) -> None:
    """Record one hit for `key`; 429 if that's over `limit`."""
    now = time.monotonic()
    with _lock:
        stamps = _hits[key]
        while stamps and now - stamps[0] >= limit.window_s:
            stamps.popleft()
        if len(stamps) >= limit.count:
            retry = max(1, math.ceil(limit.window_s - (now - stamps[0])))
            raise HTTPException(
                status_code=429,
                detail="Too many requests - please wait and try again",
                headers={"Retry-After": str(retry)},
            )
        stamps.append(now)


def client_ip(request: Request) -> str:
    # Only trust X-Forwarded-For behind our own proxy (e.g. ngrok via tunnel.py).
    if os.getenv("TRUST_PROXY") == "1":
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def ai_rate_limit(name: str, request: Request, user: Optional[User]) -> None:
    per_user, per_anon_ip = AI_LIMITS[name]
    ip = client_ip(request)
    hit(f"ip:{ip}", IP_CEILING)
    if user is not None:
        hit(f"{name}:user:{user.id}", per_user)
    else:
        hit(f"{name}:ip:{ip}", per_anon_ip)


# ---------- daily LLM budget ----------

DAILY_CALL_CAP = int(os.getenv("AI_DAILY_CALL_CAP", "2000"))
DAILY_TOKEN_CAP = int(os.getenv("AI_DAILY_TOKEN_CAP", "2000000"))

_budget = {"day": None, "calls": 0, "tokens": 0}
_budget_lock = threading.Lock()


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def reserve_llm_call(estimated_tokens: int) -> bool:
    """Count one LLM call against today's budget. False = budget spent, don't call."""
    with _budget_lock:
        if _budget["day"] != _today():
            _budget.update(day=_today(), calls=0, tokens=0)
        if _budget["calls"] >= DAILY_CALL_CAP or _budget["tokens"] + estimated_tokens > DAILY_TOKEN_CAP:
            return False
        _budget["calls"] += 1
        _budget["tokens"] += estimated_tokens
        return True


def record_llm_tokens(estimated: int, actual: Optional[int]) -> None:
    """Swap the estimate for the real count once the model reports usage."""
    if actual is None:
        return
    with _budget_lock:
        _budget["tokens"] += actual - estimated
