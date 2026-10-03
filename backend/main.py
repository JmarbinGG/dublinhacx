from dotenv import load_dotenv

load_dotenv()  # before anything reads os.getenv (DATABASE_URL, SEARCH_SERVICE_URL, CHAT_SERVICE_URL)

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from sqlalchemy import inspect, text

import auth
from database import Base, engine
from routers import chat, listings, search, uploads, users
from storage import UPLOAD_DIR

Base.metadata.create_all(bind=engine)

# create_all doesn't add columns to existing tables - patch older app.db files.
if "client_id" not in {c["name"] for c in inspect(engine).get_columns("listings")}:
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE listings ADD COLUMN client_id VARCHAR"))
        conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_listing_owner_client ON listings (owner_id, client_id)"
        ))

app = FastAPI(title="Banyan API", description="Share what you have. Find what you need.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)



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
app.include_router(uploads.router)
app.include_router(chat.router)


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
