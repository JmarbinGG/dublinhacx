import base64
import json
import os
import re

import requests

from .base import AnalysisResult
from .categories import CATEGORIES

NVIDIA_CHAT_URL = "https://integrate.api.nvidia.com/v1/chat/completions"

# The build.nvidia.com model to use — must be one of their vision-capable
# chat models (accepts "image_url" content blocks). Override with
# NVIDIA_VLM_MODEL if you want a different one from the catalog.
DEFAULT_MODEL = "meta/llama-3.2-11b-vision-instruct"

_CATEGORY_LIST = ", ".join(CATEGORIES)

PROMPT = (
    "You are labeling a photo of waste or surplus material for a B2B reuse "
    "marketplace. Look at the image and respond with ONLY a JSON object, no "
    "other text, no markdown fences, in exactly this shape:\n"
    '{"name": "short, specific listing title, e.g. \'Oak Pallet Offcuts\'", '
    f'"category": "exactly one of: {_CATEGORY_LIST}", '
    '"tags": ["keyword", "keyword"], '
    '"quantity": "your best rough visual estimate, e.g. \'~15 pieces\' or \'1 pallet\'"}\n\n'
    "Rules:\n"
    f"- category MUST be one of: {_CATEGORY_LIST}. Pick the closest match even if imperfect.\n"
    "- name should describe the specific material/item, not just repeat the category.\n"
    "- quantity is a rough visual estimate (count, weight, or volume) — approximate is fine, "
    "never leave it blank."
)


class NvidiaVlmClassifier:
    """Vision-language model hosted on build.nvidia.com (OpenAI-compatible
    chat/completions with image_url content). Unlike zero-shot CLIP, this
    actually looks at the photo and writes a title/category/quantity guess
    instead of picking from a fixed label list. Set AI_BACKEND=nvidia and
    NVIDIA_API_KEY to use this.
    """

    def __init__(self, api_key: str | None = None, model: str | None = None):
        self.api_key = api_key or os.getenv("NVIDIA_API_KEY")
        if not self.api_key:
            raise RuntimeError(
                "NVIDIA_API_KEY is not set. Get a key at build.nvidia.com and "
                "put it in backend/.env"
            )
        self.model = model or os.getenv("NVIDIA_VLM_MODEL", DEFAULT_MODEL)

    def analyze(self, image_bytes: bytes) -> AnalysisResult:
        data_uri = "data:image/jpeg;base64," + base64.b64encode(image_bytes).decode()

        response = requests.post(
            NVIDIA_CHAT_URL,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Accept": "application/json",
            },
            json={
                "model": self.model,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": PROMPT},
                            {"type": "image_url", "image_url": {"url": data_uri}},
                        ],
                    }
                ],
                "max_tokens": 512,
                "temperature": 0.2,
                "stream": False,
            },
            # Bigger vision models (e.g. moonshotai/kimi-k3, a 2.8T-param MoE)
            # can comfortably exceed 60s - the default Llama vision model
            # rarely needed more than a few seconds, but this needs to cover
            # whichever model NVIDIA_VLM_MODEL is actually pointed at.
            timeout=180,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        return _parse(content)


def _parse(content: str) -> AnalysisResult:
    match = re.search(r"\{.*\}", content, re.DOTALL)
    if not match:
        return AnalysisResult(
            name="Unidentified Materials",
            category="construction",
            tags=["unsorted"],
            quantity="1 unit (please adjust)",
            confidence=0.0,
        )

    try:
        data = json.loads(match.group())
    except json.JSONDecodeError:
        return AnalysisResult(
            name="Unidentified Materials",
            category="construction",
            tags=["unsorted"],
            quantity="1 unit (please adjust)",
            confidence=0.0,
        )

    category = str(data.get("category") or "").strip().lower()
    if category not in CATEGORIES:
        category = "construction"

    return AnalysisResult(
        name=data.get("name") or "Unidentified Materials",
        category=category,
        tags=data.get("tags") or ["unsorted"],
        quantity=data.get("quantity") or "1 unit (please adjust)",
        confidence=1.0,
    )
