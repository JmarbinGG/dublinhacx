# Single source of truth for listing categories — used by every AI backend's
# prompt/label set so the model can only pick a category that actually
# exists in the app (matches the categories used across backend/main.py).
CATEGORIES = ["wood", "metal", "paper", "organic", "plastic", "fixtures", "construction"]
