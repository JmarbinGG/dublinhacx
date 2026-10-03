import io

from .base import AnalysisResult

# (display name, category, tags) — CLIP is asked "a photo of {name}" for each
# and we take the best match. Extend this list as new waste categories show up.
CANDIDATES: list[tuple[str, str, list[str]]] = [
    ("Fresh Eggs", "produce", ["eggs", "poultry"]),
    ("Fresh Vegetables", "produce", ["vegetables", "garden"]),
    ("Honey Jars", "produce", ["honey", "bees"]),
    ("Bulk Grain", "produce", ["grain", "feed"]),
    ("Seed Packets", "seeds", ["seeds", "heirloom"]),
    ("Seed Potatoes", "seeds", ["potatoes", "seed potatoes"]),
    ("Garlic Bulbs", "seeds", ["garlic", "seed garlic"]),
    ("Tractor", "heavy_tools", ["tractor", "equipment"]),
    ("Log Splitter", "heavy_tools", ["log splitter", "firewood"]),
    ("Excavator", "heavy_tools", ["excavator", "earthwork"]),
    ("Chainsaw", "heavy_tools", ["chainsaw", "tools"]),
    ("Welding Work", "skills_services", ["welding", "repair"]),
    ("Carpentry Work", "skills_services", ["carpentry", "building"]),
    ("Firewood", "general", ["firewood", "wood"]),
    ("Wood Pallets", "general", ["wood", "pallets"]),
    ("Lumber", "general", ["wood", "lumber"]),
    ("Scrap Metal", "general", ["metal", "scrap"]),
    ("Bricks", "general", ["brick", "masonry"]),
    ("Wooden Barrels", "general", ["barrels", "oak"]),
]


class ClipClassifier:
    """Zero-shot image classification via OpenAI's CLIP (runs on CUDA if
    available, else CPU — set AI_BACKEND=clip to use this).

    CLIP scores an image against a fixed list of candidate labels; it
    doesn't count objects or write free-form captions, so "quantity" here
    is a placeholder for the user to edit, not a real count.
    """

    def __init__(self, model_name: str = "openai/clip-vit-base-patch32"):
        import torch
        from transformers import CLIPModel, CLIPProcessor

        self.torch = torch
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = CLIPModel.from_pretrained(model_name).to(self.device)
        self.processor = CLIPProcessor.from_pretrained(model_name)

    def analyze(self, image_bytes: bytes) -> AnalysisResult:
        from PIL import Image

        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        labels = [f"a photo of {name.lower()}" for name, _, _ in CANDIDATES]

        inputs = self.processor(text=labels, images=image, return_tensors="pt", padding=True)
        inputs = {k: v.to(self.device) for k, v in inputs.items()}

        with self.torch.no_grad():
            outputs = self.model(**inputs)
        probs = outputs.logits_per_image.softmax(dim=1)[0]

        best_idx = int(probs.argmax())
        name, category, tags = CANDIDATES[best_idx]
        return AnalysisResult(
            name=name,
            category=category,
            tags=tags,
            quantity="1 unit (please adjust)",
            confidence=float(probs[best_idx]),
        )
