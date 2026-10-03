import io

from .base import AnalysisResult

# (display name, category, tags) — CLIP is asked "a photo of {name}" for each
# and we take the best match. Extend this list as new waste categories show up.
CANDIDATES: list[tuple[str, str, list[str]]] = [
    ("Wood Pallets", "wood", ["wood", "pallets"]),
    ("Plywood Offcuts", "wood", ["wood", "plywood"]),
    ("Lumber Offcuts", "wood", ["wood", "lumber"]),
    ("Cabinet Panel Scraps", "wood", ["wood", "cabinet"]),
    ("Scrap Metal", "metal", ["metal", "scrap"]),
    ("Steel Rebar", "metal", ["metal", "rebar"]),
    ("Sheet Metal", "metal", ["metal", "sheet metal"]),
    ("Copper Wire and Pipe", "metal", ["metal", "copper"]),
    ("Cardboard Boxes", "paper", ["paper", "cardboard"]),
    ("Bricks", "construction", ["construction", "brick"]),
    ("Concrete Blocks", "construction", ["construction", "concrete"]),
    ("Ceramic Tile", "construction", ["construction", "tile"]),
    ("Drywall Sheets", "construction", ["construction", "drywall"]),
    ("Construction Debris", "construction", ["construction", "debris"]),
    ("Door Hardware", "fixtures", ["fixtures", "hardware"]),
    ("Light Fixtures", "fixtures", ["fixtures", "lighting"]),
    ("Plumbing Fixtures", "fixtures", ["fixtures", "plumbing"]),
    ("Produce Crates", "organic", ["organic", "produce"]),
    ("Plastic Scraps", "plastic", ["plastic"]),
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
