import os

from .base import ImageClassifier

_classifier: ImageClassifier | None = None


def get_classifier() -> ImageClassifier:
    """Returns the configured image classifier, built once and cached.

    AI_BACKEND selects the implementation:
      - "nvidia": vision-language model via build.nvidia.com (needs
        NVIDIA_API_KEY). This is the default the moment NVIDIA_API_KEY is
        set — no other config needed. Override the model with
        NVIDIA_VLM_MODEL.
      - "clip": local CLIP inference (needs `torch` + `transformers`, see
        requirements-ai.txt).
      - anything else / unset with no key: mock, so the upload flow works
        with zero extra dependencies.
    """
    global _classifier
    if _classifier is not None:
        return _classifier

    default_backend = "nvidia" if os.getenv("NVIDIA_API_KEY") else "mock"
    backend = os.getenv("AI_BACKEND", default_backend).lower()

    if backend == "nvidia":
        from .nvidia_vlm_classifier import NvidiaVlmClassifier

        _classifier = NvidiaVlmClassifier()
    elif backend == "clip":
        from .clip_classifier import ClipClassifier

        _classifier = ClipClassifier()
    else:
        from .mock_classifier import MockClassifier

        _classifier = MockClassifier()

    return _classifier
