"""AI assistant chat, proxied to a Qwen model.

The Qwen service must expose an OpenAI-compatible chat API, which is what
vLLM, Ollama and DashScope all serve Qwen behind:

    POST {CHAT_SERVICE_URL}/chat/completions
    {"model": CHAT_MODEL, "messages": [...], "stream": true}
    -> SSE lines `data: {"choices":[{"delta":{"content":"..."}}]}` ... `data: [DONE]`

e.g. CHAT_SERVICE_URL=http://localhost:11434/v1 (Ollama) or
http://localhost:8001/v1 (vLLM). CHAT_API_KEY is sent as a bearer token if set.

Clients call POST /api/chat and get Server-Sent Events back:
    data: {"delta": "Harvest"}
    data: {"delta": "er repair is"}
    ...
    data: {"done": true}
or, if anything goes wrong, a single `data: {"error": "..."}`.
"""

import json
import logging
import os
from typing import Iterator, Literal, Optional

import requests
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session as DbSession

from auth import optional_user
from database import get_db
from models import Listing, User
from routers.listings import base_query

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["chat"])

CONTEXT_LISTINGS = 8
CHAT_TIMEOUT_S = 60

SYSTEM_PROMPT = """You are the assistant for Banyan, an app where people in small rural \
towns share spare materials, lend unused equipment and tools, and offer or ask for \
skills, knowledge and work - within their own town and with nearby towns. \
Tagline: "Share what you have. Find what you need."

Help people find what they need on Banyan, write good listings, and figure out who \
nearby could help. Keep answers short, practical and friendly; many users are on slow \
connections and small phones. Only mention listings from the list below - never invent \
listings, people or prices. If nothing fits, suggest posting a request."""


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=20)


def _relevant_listings(db: DbSession, text: str) -> list[Listing]:
    """Cheap grounding: available listings matching any longer word of the question."""
    words = [w for w in "".join(c if c.isalnum() else " " for c in text.lower()).split() if len(w) >= 4]
    if not words:
        return []
    clauses = []
    for w in words[:10]:
        like = f"%{w}%"
        clauses += [Listing.title.ilike(like), Listing.tags.ilike(like), Listing.category.ilike(like)]
    return (
        base_query(db)
        .filter(Listing.status == "available", or_(*clauses))
        .order_by(Listing.created_at.desc())
        .limit(CONTEXT_LISTINGS)
        .all()
    )


def _context(listings: list[Listing], user: Optional[User]) -> str:
    lines = []
    if user and user.community:
        lines.append(f"The person asking lives in {user.community}.")
    if listings:
        lines.append("Possibly relevant listings on Banyan right now:")
        for l in listings:
            price = f", {l.price}" if l.price else ""
            lines.append(
                f"- [{l.type}/{l.kind}] {l.title} - {l.owner.name}, {l.owner.community or 'unknown town'}"
                f" ({l.exchange}{price}) [listing #{l.id}]"
            )
    else:
        lines.append("No listings matched this question.")
    return "\n".join(lines)


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _stream(url: str, messages: list[dict]) -> Iterator[str]:
    headers = {}
    if os.getenv("CHAT_API_KEY"):
        headers["Authorization"] = f"Bearer {os.getenv('CHAT_API_KEY')}"
    try:
        with requests.post(
            f"{url.rstrip('/')}/chat/completions",
            json={"model": os.getenv("CHAT_MODEL", "qwen2.5"), "messages": messages, "stream": True},
            headers=headers,
            stream=True,
            timeout=CHAT_TIMEOUT_S,
        ) as resp:
            resp.raise_for_status()
            for line in resp.iter_lines(decode_unicode=True):
                if not line or not line.startswith("data:"):
                    continue
                data = line.removeprefix("data:").strip()
                if data == "[DONE]":
                    break
                delta = (json.loads(data).get("choices") or [{}])[0].get("delta", {}).get("content")
                if delta:
                    yield _sse({"delta": delta})
        yield _sse({"done": True})
    except (requests.RequestException, ValueError) as e:
        log.warning("Chat service failed: %s", e)
        yield _sse({"error": "The assistant is unavailable right now. Try again in a moment."})


@router.post("")
def chat(body: ChatRequest, user: Optional[User] = Depends(optional_user), db: DbSession = Depends(get_db)):
    """Sign-in optional; when signed in, answers are tailored to the user's town.
    Sync def: the upstream stream blocks, so it runs in the thread pool."""
    url = os.getenv("CHAT_SERVICE_URL")
    if not url:
        raise HTTPException(status_code=503, detail="Chat isn't configured (CHAT_SERVICE_URL unset)")

    last_user = next((m.content for m in reversed(body.messages) if m.role == "user"), "")
    # Everything touching the DB happens here, before the session closes and
    # the response starts streaming.
    context = _context(_relevant_listings(db, last_user), user)
    messages = [{"role": "system", "content": f"{SYSTEM_PROMPT}\n\n{context}"}] + [
        m.model_dump() for m in body.messages
    ]
    return StreamingResponse(
        _stream(url, messages),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
