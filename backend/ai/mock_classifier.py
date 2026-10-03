from .base import AnalysisResult


class MockClassifier:
    """Dependency-free stand-in used when AI_BACKEND is unset. Lets the
    upload flow work end-to-end before any real model is wired up."""

    def analyze(self, image_bytes: bytes) -> AnalysisResult:
        return AnalysisResult(
            name="Unidentified Materials",
            category="construction",
            tags=["unsorted"],
            quantity="1 unit (please adjust)",
            confidence=0.0,
        )
