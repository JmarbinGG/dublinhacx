import type { Listing } from '../types'
import { deleteJSON, getJSON, postJSON } from './client'

/**
 * Backend routes (see backend/main.py):
 *
 *   GET    /api/search?query=<q>   full-text-ish search over name/category/location
 *   GET    /api/listings           every listing
 *   GET    /api/listings?id=<id>   a single listing (404 if missing)
 *   GET    /api/listings/mine      only the signed-in user's own listings (401 if signed out)
 *   POST   /api/upload             create a listing - only `name` is required;
 *                                  attributed to the signed-in user if a token is passed
 *   DELETE /api/listings/<id>      remove a listing - 401 signed out, 403 if you don't own it
 *
 * Note the search param is `query`, not `q`, and a single listing is fetched
 * with an `id` query param rather than a path segment. Photo analysis lives
 * in api/analyze.ts (POST /api/analyze), not here.
 */
const SEARCH_PATH = '/api/search'
const LISTINGS_PATH = '/api/listings'
const MY_LISTINGS_PATH = '/api/listings/mine'
const UPLOAD_PATH = '/api/upload'

/**
 * FastAPI returns bare arrays here, but we also accept a `{ results: [...] }`
 * style envelope so a future change on the backend doesn't break the UI.
 */
function toListingArray(payload: unknown): Listing[] {
  if (Array.isArray(payload)) return payload as Listing[]

  if (payload && typeof payload === 'object') {
    for (const key of ['results', 'listings', 'items', 'data']) {
      const value = (payload as Record<string, unknown>)[key]
      if (Array.isArray(value)) return value as Listing[]
    }
  }

  return []
}

/**
 * Search listings, or return everything when `query` is empty.
 *
 * The empty case deliberately hits /api/listings rather than /api/search with
 * a blank term - it is the endpoint that means "all listings".
 */
export async function searchListings(
  query: string,
  signal?: AbortSignal,
): Promise<Listing[]> {
  const trimmed = query.trim()

  const payload = trimmed
    ? await getJSON<unknown>(SEARCH_PATH, { query: trimmed }, signal)
    : await getJSON<unknown>(LISTINGS_PATH, undefined, signal)

  return toListingArray(payload)
}

/** Fetch a single listing by id. Throws ApiError with status 404 if missing. */
export async function getListing(
  id: string,
  signal?: AbortSignal,
): Promise<Listing> {
  const payload = await getJSON<unknown>(LISTINGS_PATH, { id }, signal)

  // The route is typed `list[ListingOut] | ListingOut` on the backend, so
  // tolerate an array wrapping the single row.
  if (Array.isArray(payload)) {
    const [first] = payload as Listing[]
    return first
  }

  return payload as Listing
}

/** Fields for a new listing. Only `name` is required by the backend. */
export type NewListing = {
  name: string
  category?: string
  location?: string
  quantity?: string
  email?: string
  image?: string
  owner?: string
  mailtolink?: string
  tags?: string
}

/**
 * Create a listing. Returns the saved row, including its new id.
 *
 * @param token When given, the backend attributes the listing to that user
 *              (see /api/listings/mine) - omit it to post anonymously.
 */
export function createListing(listing: NewListing, token?: string | null): Promise<Listing> {
  return postJSON<Listing>(UPLOAD_PATH, listing, token)
}

/** The signed-in user's own listings. Requires a token - there's no way to
 * browse someone else's "mine" list. */
export function getMyListings(token: string, signal?: AbortSignal): Promise<Listing[]> {
  return getJSON<Listing[]>(MY_LISTINGS_PATH, undefined, signal, token)
}

/** Delete a listing you own. 403s if the token's user isn't its owner. */
export function deleteListing(id: string | number, token: string): Promise<{ status: string }> {
  return deleteJSON<{ status: string }>(`${LISTINGS_PATH}/${id}`, token)
}
