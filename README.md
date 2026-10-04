# Banyan
## By Jahan and Alek
## First Place in CWP Track at DublinHacx
**Share what you have. Find what you need.**

Banyan connects neighbours in small rural towns, and the towns around them, to share spare
materials, lend unused tools and equipment, and offer skills and work. A leftover roll of drip
pipe, a pump set sitting idle, someone who can fix a tractor or stitch school uniforms: Banyan
helps them reach the person who needs them, in the same town or the next one over.

Like a banyan tree, whose branches drop roots that become new trunks, each town is its own
centre and all of them are connected.

**Live:** https://banyanshare.xyz

## What it does

- **One search bar, in plain words.** "screws", "things I can use to cut down a tree",
  "someone who can fix my tractor", "free seeds within 10 km". Simple searches go straight to
  the database. Goals are worked out by an AI model into what to look for (axe, saw,
  chainsaw…). Asking for a person returns only people offering that skill.
- **Refine box.** Narrow a search down in your own words ("5", "small", "only free ones
  nearby") without starting over.
- **Photo → listing.** Upload a photo and a vision model fills in the title, category, tags,
  quantity and description in about 1.5 s. Users check it before posting.
- **English, Spanish and Hindi.** The interface, every listing and bio, search (type in any of
  the three) and the assistant all work in the user's language.
- **AI assistant.** A chat helper that asks one clarifying question, then points to real
  listings only.
- **Built for slow, capped connections.** Text first; photos never load on their own (each
  shows its size and loads on tap); a monthly data budget; gzip everywhere; slim search
  results (~1 KB); the last listings seen stay readable offline, and posts made offline are
  sent later.
- **Profiles and towns.** Photo, name, bio and listings per person; towns with members,
  listings and distances between them.

## How it's built

| Part | Stack |
|---|---|
| Frontend | React + TypeScript + Vite, shipped as Preact (~70 KB smaller), service worker for offline |
| Backend | Python, FastAPI, SQLAlchemy, SQLite |
| Search & assistant | Qwen3-4B on Featherless (routing, expanding goals, relevance check) |
| Photo autofill | Qwen3-VL-30B-A3B on Featherless |
| Translation | Hand-translated seed data; new posts by Qwen3-30B-A3B; UI strings by DeepSeek V4 Flash |
| Hosting | Backend serves the built frontend; Cloudflare Tunnel to banyanshare.xyz |

AI is used carefully: models only return search terms or listing ids that the backend checks
against the database, user text is fenced and stripped of links and contact details before
it reaches a model, everything has rate limits and a daily budget, and search falls back to
plain keyword matching if a model is slow or down.

## Run it locally

Backend (http://localhost:8000):

```bash
cd backend
pip3 install -r requirements.txt
cp .env.example .env           # add LLM_API_KEY (Featherless) for the AI features
python3 -m uvicorn main:app --reload
```

Frontend (http://localhost:5173/app):

```bash
cd frontend/react
npm install
npm run dev
```

Without an API key everything still works except the AI features, which fall back to keyword
search.

**Demo account:** `demo.user@example.com` / `password` (lives in Palm Grove, the town with
the most listings; every seed account uses the password `password`).

Host it on your own domain (after `cloudflared tunnel login` and creating a tunnel named
`banyan`):

```bash
./host.sh yourdomain.xyz
```

## Project layout

```
backend/
  main.py                FastAPI app, middleware, serves the built frontend
  routers/smart_search.py  the one search bar: rules, models, refine
  routers/uploads.py     photo upload + photo -> listing details
  routers/assistant.py   AI assistant
  i18n.py                listing/bio translations, multilingual search
  app.db                 seed data: 40 people, ~500 listings in 10 towns
frontend/react/src/
  pages/                 home, search, listing, post, profile, towns, data saver
  i18n/                  en / es / hi strings
  api/                   API client, offline cache
host.sh                  build + serve + Cloudflare Tunnel
```
