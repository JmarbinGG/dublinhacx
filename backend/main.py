from dotenv import load_dotenv

load_dotenv()  # before anything reads os.getenv (DATABASE_URL, LLM_SERVICE_URL, ...)

import os

from fastapi import FastAPI, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

import auth
from database import Base, engine
from routers import assistant, listings, search, smart_search, uploads, users
from storage import UPLOAD_DIR

Base.metadata.create_all(bind=engine)

# create_all doesn't add columns to existing tables - patch older app.db files.
if "client_id" not in {c["name"] for c in inspect(engine).get_columns("listings")}:
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE listings ADD COLUMN client_id VARCHAR"))
        conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_listing_owner_client ON listings (owner_id, client_id)"
        ))

PRODUCTION = os.getenv("APP_ENV") == "production"

app = FastAPI(title="Banyan API", description="Share what you have. Find what you need.")

# CORS: only our frontend. CORS_ORIGINS is a comma-separated list (deployed
# site, ngrok URL). Outside production the Vite dev server on localhost or a
# private-LAN address (phones on the same wifi) is allowed too.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()],
    allow_origin_regex=None if PRODUCTION else (
        r"https?://(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+"
        r"|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?"
    ),
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "Accept", "ngrok-skip-browser-warning"],
    expose_headers=["Retry-After"],
)

# Low data use: compress every JSON response over ~0.5 KB (lists shrink 3-5x).
app.add_middleware(GZipMiddleware, minimum_size=500)

AI_PATHS = ("/api/search/ai", "/api/search/smart", "/api/assistant")


@app.exception_handler(RequestValidationError)
async def validation_errors(request: Request, exc: RequestValidationError):
    """AI endpoints get a generic message instead of pydantic's details."""
    if request.url.path.startswith(AI_PATHS):
        return JSONResponse(status_code=422, content={"detail": "Invalid request"})
    return await request_validation_exception_handler(request, exc)


@app.middleware("http")
async def nosniff_uploads(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/uploads/"):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Content-Security-Policy"] = "default-src 'none'; sandbox"
    return response


app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(listings.router)
app.include_router(search.router)
app.include_router(smart_search.router)
app.include_router(uploads.router)
app.include_router(assistant.router)


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
