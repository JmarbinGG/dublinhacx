# Single source of truth for listing categories - used by every AI backend's
# prompt/label set so the model can only pick a category that actually
# exists in the app (main.py asserts its Category type matches this).
CATEGORIES = ["produce", "seeds", "heavy_tools", "skills_services", "general"]
