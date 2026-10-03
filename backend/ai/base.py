from dataclasses import dataclass
from typing import Protocol


@dataclass
class AnalysisResult:
    name: str
    category: str
    tags: list[str]
    quantity: str
    confidence: float


class ImageClassifier(Protocol):
    """Anything that can look at an image and guess what's in it.

    Swap implementations via the AI_BACKEND env var (see factory.py) —
    every backend just needs to satisfy this one method.
    """

    def analyze(self, image_bytes: bytes) -> AnalysisResult: ...
