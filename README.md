# byproduct.

A low-bandwidth marketplace for rural communities, designed for a
1 GB/month data cap. Why use an app to reach someone 12 miles away instead
of walking to your neighbor? For the specialized things your neighbor
doesn't have: heirloom seed, heavy machinery, craft labor and bulk
regional trade. Every listing shows which community it's in and how far
away that is.

Built at IslandHacks 2026.

## Stack

- **Frontend**: React 19 + TypeScript + Vite, React Router
- **Backend**: FastAPI + SQLAlchemy + SQLite
- **AI**: pluggable image classifier (vision-language model via
  [build.nvidia.com](https://build.nvidia.com), local CLIP, or a
  dependency-free mock) that looks at a listing photo and suggests a name,
  category, tags, and quantity

## Features

- **Text-first, data-budgeted:** listing JSON is gzipped (the full seed feed
  is ~4 KB). Photos never load automatically. Each card shows the photo's
  size in KB and a "Load image" button. A monthly image budget is tracked
  in the navbar and set on the Data Saver page.
- **Communities and distance:** pick your home community, and every card
  gets a distance badge (e.g. "14 mi away · Cedar Creek").
- **Filters:** distance bands (nearby, beyond 5 miles, beyond 10 miles), a
  "Specialized trade" toggle (seeds, heavy tools, skills and services),
  category, and nearest, farthest or newest sort. Filters live in the URL.
- **Offline-first:** the last listings you saw are cached and shown when the
  connection drops. Listings posted offline are queued on the device and
  replayed through `POST /api/sync`, which is idempotent per entry.
- **Photos:** uploads are verified as images, stripped of EXIF/GPS, resized
  to 800px and recompressed as JPEG before storing. AI suggests the title,
  category and description.
- **Accounts:** sign-up requires an 8+ character password. Emails are
  case-insensitive. Sessions expire after 7 days and are revoked server-side
  on sign-out. Contact emails are shown only to signed-in members. Sign-in,
  sign-up, upload and create are rate-limited.

## Running it locally

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API listens on `http://localhost:8000`. On first run it creates
`marketplace.db` (SQLite) and seeds it with 7 sample communities and 24
listings. An old `listings.db` from before the rework is ignored. See
`backend/.env.example` for all settings, including `CORS_ORIGINS`.

Optional `.env` in `backend/`:

```
NVIDIA_API_KEY=your-key-here      # enables real AI photo analysis
NVIDIA_VLM_MODEL=some/other-model # override the default vision model
```

Without `NVIDIA_API_KEY` set, photo analysis falls back to a mock
classifier so the upload flow still works end-to-end with zero extra
dependencies.

### Frontend

```bash
cd frontend/react
npm install
npm run dev
```

Opens on `http://localhost:5173` and talks to the backend on port 8000.
Works over LAN too (e.g. to test from a phone) - the frontend figures out
the right API host automatically from whatever hostname you loaded the
page from.

## Project structure

```
backend/
  main.py              FastAPI app: models, routes, auth
  seed.py              sample communities + listings
  ai/                  pluggable image classifier (nvidia / clip / mock)
frontend/react/
  src/
    pages/             one file per route
    components/        shared UI (RuralMarketCard, DataBudgetImage, FilterBar, ...)
    api/               fetch wrappers + offline cache
    auth/              signed-in user/session context
    context/           home community + distances, image data budget
    offline/           queue for listings created offline
```
