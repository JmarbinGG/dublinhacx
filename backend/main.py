from dotenv import load_dotenv

load_dotenv()  # before anything reads os.getenv (DATABASE_URL, SEARCH_SERVICE_URL)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import auth
from database import Base, engine
from routers import listings, search, uploads, users

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Banyan API", description="Share what you have. Find what you need.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=uploads.UPLOAD_DIR), name="uploads")

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(listings.router)
app.include_router(search.router)
app.include_router(uploads.router)


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
