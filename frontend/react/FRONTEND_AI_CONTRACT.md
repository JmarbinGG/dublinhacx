# Search and AI endpoints the frontend calls

The frontend is built against the routes below. None of them exist on the
backend yet. Until they do:

- **One search bar** (`POST /api/search`): in `npm run dev`, a `404` or `405`
  triggers a local demo, labelled "demo". In production builds, any failure
  falls back to the existing `GET /api/search` with a one-line note.
- **Assistant:** hidden behind `VITE_ENABLE_ASSISTANT=1` until you confirm it
  stays.

**Please confirm:** the single search bar replaces the separate
`/api/search/ai` overview. The frontend no longer calls `/api/search/ai`.

## 1. One search bar: `POST /api/search`

The client never decides whether a query is simple or complex. It sends the
query and renders whatever comes back. Exactly one request is in flight at a
time; a new search, a refine or Cancel aborts the previous one.

### Request

```json
{
  "q": "things I can use to cut down a tree",
  "refinements": ["5", "small"],
  "exclude": ["chainsaw"],
  "community": "Greenfield",
  "filters": { "type": "equipment", "kind": "offer", "exchange": "lend", "scope": "near" },
  "offset": 0,
  "limit": 12,
  "compact": true,
  "allow_ai": true,
  "search_id": "abc123"
}
```

| Field | Meaning |
|---|---|
| `q` | At most 200 characters and 8 words, trimmed, with whitespace collapsed. Emails, phone numbers and coordinates are already removed. |
| `refinements` | Raw terms, added one at a time (at most 5, each at most 40 characters). The client never interprets them. Please work out whether "5" is a quantity, a size or something else. |
| `exclude` | Interpreted terms the user removed (the chips' ×). Re-run without them. |
| `filters.scope` | `town`, `others` or `near`, relative to `community`. Omitted means anywhere. |
| `compact` | Return the compact row shape below. |
| `allow_ai` | False when the user turned AI off in Data saver. Use the simple route only. |
| `search_id` | Sent on refine and "Show more" when you returned one, so you can refine without redoing the expensive part. The client never sends result lists back. |

### Response

```json
{
  "route": "complex",
  "ai": true,
  "interpreted": ["axe", "saw", "hatchet"],
  "suggestions": [{ "code": "free", "label": "Free" }, { "code": "quantity:5", "label": "Quantity 5" }],
  "listings": [ /* compact ListingOut rows */ ],
  "users": [],
  "search_id": "abc123",
  "offset": 0,
  "has_more": true
}
```

| Field | What the frontend does with it |
|---|---|
| `route`, `ai` | When `ai` is true, the page shows "AI-assisted, may be wrong". Nothing is shown for simple searches. |
| `interpreted` | Shown as "Searched for:" chips (at most 8, each at most 40 characters). Each chip has an × that re-runs the search with that term in `exclude`. |
| `suggestions` | Shown as tap-to-add chips (at most 6). Tapping one sends its `code` as a refinement. |
| `listings` | Rendered in the order you return them. The frontend only shows rows that came back here, and drops any row without an integer `id`, a `title` and an `owner`. |
| `has_more` | Shows a "Show more" button, which sends the next `offset` along with your `search_id`. |

**Compact rows.** Cards only need `id`, `type`, `kind`, `title`, `image`,
`image_size_kb`, `exchange`, `price`, `status`, `owner{id,name,community}` and
`distance_km`. Everything else (the description and so on) is fetched from
`GET /api/listings/{id}` when someone opens the listing. `image_size_kb`
lets the "Load image" button show the cost without an extra request. Please
add it to `ListingOut` everywhere.

**Errors.**

- On `429`, the frontend reads `Retry-After`.
- On a timeout (20 seconds), an error or a `429`, it falls back to
  `GET /api/search?q=<q and refinements>` and shows a one-line note.
- When offline, it shows a saved copy of the same search, or keyword
  matches over listings saved on the device.
- Keep error text generic.

## 2. Assistant (behind `VITE_ENABLE_ASSISTANT`)

| Endpoint | Request | Response |
|---|---|---|
| `POST /api/assistant/session` | `{}` | `{ session_id }` |
| `POST /api/assistant/chat` | `{ session_id, message (at most 500 characters), community? }` | `{ text, chips: [{ code, label }], listing_ids: [] }` |
| `POST /api/assistant/report` | `{ session_id, reason }` | `{ ok }` |

How the frontend handles session errors:

- **`404` or `410`:** the session has expired. The frontend starts a new
  session and resends the message once.
- **`409`:** the server is still answering the previous message.
- **`429`:** the frontend shows "busy, try again in N seconds".

## Backend rules we're asking for

1. **Routing cost.** Decide simple or complex with cheap rules first (word
   count, question words, phrases like "things I can use to"). Call the small
   model only when the rules are unsure. Cache routing decisions and results
   per normalised query.
2. **Prompt injection.** Listing and profile text that goes to the model is
   untrusted input. Fence it, strip URLs, and use structured output. Give the
   model read-only tools only.
3. **Real listings only.** The model returns ids only, and you hydrate them
   from the database (like `_hydrate`). Drop ids that don't exist, and fall
   back to keyword search on malformed output rather than returning a 500.
4. **No personal data to the model.** Never send emails, password hashes or
   exact coordinates.
5. **Rate limits.**
   - Count the router and refine calls too.
   - Make the per-IP allowance for anonymous users generous, because many
     people share one rural connection.
   - Add a daily spend cap.
   - Return `429` with `Retry-After`.
6. **Input caps.** Limit `q` to 200 characters and about 8 words. Escape `%`
   and `_` in `keyword_filter`.
7. **Compression and paging.** Use gzip and pages of about 12.
8. **Corpus key.** Require `SEARCH_SERVICE_KEY` on `/api/search/corpus`, and
   compare it with `hmac.compare_digest`.
9. **CORS.** Use a list of allowed origins instead of `allow_origins=["*"]`.
