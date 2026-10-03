"""The fixed listing categories. Every listing has exactly one; the post
form shows them as a dropdown, and search uses them to narrow results.

`normalize` turns anything a client sends - an id, a label, or old free
text like "farm tools" - into one of the ids, so older clients and
offline-queued posts keep working."""

import re
from typing import Optional

CATEGORIES: list[tuple[str, str]] = [
    ("farming", "Farming"),
    ("building", "Building"),
    ("energy-repair", "Energy and repair"),
    ("digital-learning", "Digital and learning"),
    ("crafts", "Crafts"),
    ("household", "Household"),
    ("other", "Other"),
]
IDS = [cid for cid, _ in CATEGORIES]
LABELS = dict(CATEGORIES)

# Free text -> category, first match wins. Shared with the frontend's old
# keyword mapping so existing listings land where users already saw them.
_KEYWORDS: list[tuple[str, re.Pattern]] = [
    ("farming", re.compile(r"farm|organic|dairy|irrigat|seed|crop|cattle|poultry|harvest|coconut|sugarcane|"
                           r"compost|fodder|livestock|bee|garden|tractor|plough|tiller")),
    ("building", re.compile(r"build|carpent|metal|brick|cement|concrete|construct|timber|wood|plumb|transport|"
                            r"mason|roof|weld|steel|iron")),
    ("energy-repair", re.compile(r"electr|solar|mechanic|repair|engine|pump|wiring|inverter|battery|motor")),
    ("digital-learning", re.compile(r"digital|teach|book|tuition|computer|phone|learn|school|english|class|"
                                    r"lesson|training|laptop|printer")),
    ("crafts", re.compile(r"craft|sew|textile|pottery|tailor|weav|stitch|cloth|fabric|clay")),
    ("household", re.compile(r"house|kitchen|cook|clean|furniture|utensil|bedding")),
]


def normalize(value: Optional[str], hint: str = "") -> str:
    """Category id for an id, a label or free text. `hint` (title, tags)
    is used when the value itself doesn't say. Falls back to "other"."""
    v = (value or "").strip().lower()
    if v in LABELS:
        return v
    for cid, label in CATEGORIES:
        if v == label.lower():
            return cid
    text = f"{v} {hint.lower()}"
    for cid, pattern in _KEYWORDS:
        if pattern.search(v):  # the stated category wins over title/tags
            return cid
    for cid, pattern in _KEYWORDS:
        if pattern.search(text):
            return cid
    return "other"


# Words that, typed as a refinement, mean "only this category". Kept to
# unambiguous ones - "repair" or "wood" are better as search terms.
_CATEGORY_WORDS = {
    "farming": "farming", "building": "building", "energy": "energy-repair",
    "digital": "digital-learning", "learning": "digital-learning", "crafts": "crafts",
    "household": "household",
}


def match_word(word: str) -> Optional[str]:
    """Category id if a single refinement word (e.g. "farming") names one."""
    return _CATEGORY_WORDS.get(word.strip().lower())
