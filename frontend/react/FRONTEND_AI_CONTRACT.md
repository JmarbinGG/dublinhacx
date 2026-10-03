# Search and AI endpoints the frontend uses

## 1. One search bar: `POST /api/search/smart` (built in `routers/smart_search.py`)

The frontend uses this endpoint as built. There is no separate "Ask AI"
button anymore, and the frontend no longer calls `/api/search/ai`. That route
can be removed if nothing else uses it.

How the frontend calls it:

| Step | Body sent |
|---|---|
| New search | `{ q, community, limit: 12 }`, where `q` is at most 200 characters and 8 words, with contact details stripped |
| Each refinement, oldest first | `{ state, refine, community, limit }`, with the raw term passed through and never interpreted on the client |
| Removed term or inline filter | `{ state, community, limit }`, where the client has edited `state.terms`, `type`, `kind`, `exchange` or `max_km` |
| Show more | `{ state, offset, community, limit }` |

- **Caching.** Every request is cached on the device by its exact body for
  15 minutes. Removing the last refinement chip or pressing Back costs no
  network.
- **One request at a time.** A refine chain runs one step after another,
  never in parallel. A new search or Cancel aborts it.
- **How the response is used:**
  - `ai` true shows the label "AI-assisted, may be wrong".
  - When `mode` is `complex`, `state.terms` are shown as removable
    "Searched for" chips, introduced with `state.need`.
  - Each `suggestions` entry becomes a chip that sends its `refine` value.
  - A card's `match` is shown as "Matches: …".
  - Cards without an integer `id`/`owner_id` or a string `title`/`owner_name`
    are dropped.
- **Fallbacks.** On any failure (an error, a 20-second timeout, or a `429`
  with `Retry-After`), the frontend uses `GET /api/search?q=<q and
  refinements>&limit=12&offset=` and shows a one-line note. Offline, it uses
  saved copies, then keyword matches over listings saved on the device.
- **AI opt-out.** When the user turns AI off in Data saver, the frontend uses
  plain keyword browse (`GET /api/listings?q=`) and doesn't call `/smart`.

Could the backend add these?

1. **Town scope.** `state` has `max_km` but no "my town only" or "other
   towns" option. The inline Distance filter's "My town" and "Other towns"
   choices currently only affect the browse feed. Could `state` carry a
   community scope?
2. **People.** Slim results don't include people. Search used to show
   matching profiles via `users`. Optionally add a few, or confirm it's fine
   without them.
3. **Rate limits.** Make the per-IP anonymous allowance generous, since many
   users share one connection, and count refine steps in it.

## 2. Assistant (`/api/assistant/session`, `/chat`, `/report`)

The frontend is wired to the routes you built, but the "Ask Banyan" button is
hidden by default to keep the screen minimal. Set `VITE_ENABLE_ASSISTANT=1`
to show it.

Session errors:

- **`404` or `410`:** the frontend starts a new session and resends once.
- **`409`:** shows "still answering".
- **`429`:** shows "busy, try again in N seconds".

## 3. Other changes the frontend now uses

- **`/api/communities` `lat`/`lng`.** Distances are measured from town
  centres, and the frontend no longer fetches `/api/users?limit=200`.
- **`client_id` on `POST /api/listings`.** Offline-queued posts are retried
  safely.
- **`image_size_kb` on listings and cards.** Shown on the "Load image"
  button, so no HEAD request is needed.
