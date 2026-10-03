# AI endpoints the frontend calls

The frontend is built against these routes. Until they exist, `npm run dev`
gets a 404 from them and shows a labelled **demo** answer built from the
keyword search. In a production build, the 404 shows "AI isn't available
right now", and regular search keeps working.

The frontend checks every response against the shapes below and rejects
anything that doesn't match. It only shows listings it can re-fetch by id
from `/api/listings/{id}`.

## Endpoints

| Endpoint | Request body | Response |
|---|---|---|
| `GET /api/search?q=&type=&community=&limit=` (exists) | – | `{ query, engine: "ai" \| "keyword", listings, users }` |
| `POST /api/search/ai` | `{ q, filters: { type?, kind?, exchange?, scope? }, community }` | `{ summary, picks: [{ id, why }], caveats: string[], engine }` |
| `POST /api/assistant/session` | `{}` | `{ session_id }` |
| `POST /api/assistant/chat` | `{ session_id, message, community? }` | `{ text, chips: [{ code, label }], listing_ids: number[] }` |
| `POST /api/assistant/report` | `{ session_id, reason }` | `{ ok: true }` |

Field notes:

- **Auth.** The frontend sends `Authorization: Bearer <token>` when the user
  is signed in. Signed-out users are also allowed to call these routes, so
  either give anonymous callers a small allowance or return `401`.
- **`community`** is a town name such as "Greenfield". The frontend never
  sends coordinates, emails or phone numbers. It also strips anything that
  looks like contact details from chat text before sending.
- **`message`** is at most 500 characters, **`q`** at most 200. Both are
  trimmed, with whitespace collapsed.
- **Response sizes.** The frontend keeps at most:
  - `picks`, `chips` and `listing_ids`: 6 items each
  - `caveats`: 4 items
  - `summary`: 1200 characters, `why`: 300, `text`: 1500, `session_id`: 128

  Anything longer is cut.
- **No streaming.** Send compact JSON, with no images or HTML. All text is
  rendered as plain text.
- **Errors.** On `429`, the frontend reads `Retry-After`. A `404` or `5xx`
  shows "AI isn't available right now" and falls back to normal results.
  Keep error text generic.

## Backend rules we're asking for

1. The model and its keys stay on the server.
2. The server owns the chat history and ignores any history the client
   sends. Cap a chat at about 20 turns and 500 characters per message, and
   expire sessions.
3. The model returns listing ids only. Hydrate them from the database the
   same way `_hydrate` does. A malformed id should fall back to keyword
   search, not cause a 500.
4. Treat listing and profile text (title, description, tags, bio, contact)
   as untrusted input that may contain prompt injections. Fence it, strip
   URLs, and use structured output. Give the model only read-only, bounded
   tools.
5. Never pass the model emails, password hashes or exact coordinates.
6. Add rate limits per user and per IP, plus a daily spend cap. Return `429`
   with `Retry-After` when they're hit.
7. Cap `q` at 200 characters (about 8 words), and escape `%` and `_` in
   `keyword_filter`.
8. Make `SEARCH_SERVICE_KEY` required on `/api/search/corpus`, and compare it
   with `hmac.compare_digest`.
9. Replace `allow_origins=["*"]` with a list of allowed origins.

## Optional, makes the frontend better

- Add `image_size_kb` (or a byte count) next to `image` and `photo`. The
  frontend currently sends a HEAD request to learn each photo's size before
  showing "Load image".
- Add an `exchange` filter on `GET /api/listings`. The frontend currently
  filters exchange client-side, page by page.
- Add `distance_km` to `/api/search` results when `lat`/`lng` are passed.
