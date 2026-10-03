/**
 * Thin fetch wrapper. Every backend call in the app goes through here so the
 * base URL, error handling and JSON parsing live in exactly one place.
 */

/**
 * When the page itself was loaded from "localhost", the backend defaults to
 * "localhost:8000" too - fine on one machine. But if a phone loads the page
 * over LAN (e.g. http://192.168.1.23:5173, via vite's host:true), its own
 * "localhost" is the phone - there's nothing listening there. In that case,
 * assume the backend is on the same host the page came from, port 8000.
 * VITE_API_BASE_URL always overrides this if set explicitly.
 */
function defaultApiBase(): string {
  if (typeof window === 'undefined') return 'http://localhost:8000'
  const { protocol, hostname } = window.location
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:8000'
  }
  return `${protocol}//${hostname}:8000`
}

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? defaultApiBase()
).replace(/\/$/, '')

/** An HTTP or network failure, carrying the status code when we have one. */
export class ApiError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** FastAPI's HTTPException body is `{ "detail": "..." }` - surface that when present. */
async function errorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (body && typeof body === 'object' && typeof (body as { detail?: unknown }).detail === 'string') {
      return (body as { detail: string }).detail
    }
  } catch {
    // Body wasn't JSON - fall through to the generic message below.
  }
  return response.status === 404
    ? 'Not found.'
    : `The API returned ${response.status} ${response.statusText}.`
}

/** Adds `Authorization: Bearer <token>` when a token is given - every helper
 * below takes an optional token as its last argument for this. */
function authHeaders(token?: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/**
 * GET `path` and parse the JSON body.
 *
 * @param path   Path relative to API_BASE_URL, e.g. `/api/listings`.
 * @param params Query params. Null/undefined/empty values are dropped.
 * @param signal Abort signal, so stale requests can be cancelled.
 * @param token  Bearer token, for routes that require or vary by identity.
 */
export async function getJSON<T>(
  path: string,
  params?: Record<string, string | number | undefined | null>,
  signal?: AbortSignal,
  token?: string | null,
): Promise<T> {
  const url = new URL(`${API_BASE_URL}${path}`)
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }

  let response: Response
  try {
    response = await fetch(url, {
      signal,
      headers: {
        Accept: 'application/json',
        'ngrok-skip-browser-warning': 'true',
        ...authHeaders(token),
      },
    })
  } catch (error) {
    // AbortError means we cancelled on purpose - let callers ignore it.
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(
      `Could not reach the API at ${API_BASE_URL}. Is the backend running?`,
    )
  }

  if (!response.ok) throw new ApiError(await errorMessage(response), response.status)

  try {
    return (await response.json()) as T
  } catch {
    throw new ApiError('The API returned a response that was not valid JSON.')
  }
}

/**
 * POST `path` with a FormData body (file uploads) and parse the JSON
 * response. No Content-Type header is set - the browser fills in the
 * multipart boundary itself.
 *
 * @param path Path relative to API_BASE_URL, e.g. `/api/analyze`.
 * @param body FormData, e.g. containing a File under an `image` field.
 */
export async function postForm<T>(
  path: string,
  body: FormData,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'ngrok-skip-browser-warning': 'true' },
      body,
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(
      `Could not reach the API at ${API_BASE_URL}. Is the backend running?`,
    )
  }

  if (!response.ok) throw new ApiError(await errorMessage(response), response.status)

  try {
    return (await response.json()) as T
  } catch {
    throw new ApiError('The API returned a response that was not valid JSON.')
  }
}

/**
 * POST `path` with a JSON body and parse the JSON response.
 *
 * @param path  Path relative to API_BASE_URL, e.g. `/api/login`.
 * @param body  Request body, sent as JSON.
 * @param token Bearer token, e.g. to attribute a created listing to a user.
 */
export async function postJSON<T>(path: string, body: unknown, token?: string | null): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'ngrok-skip-browser-warning': 'true',
        ...authHeaders(token),
      },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiError(
      `Could not reach the API at ${API_BASE_URL}. Is the backend running?`,
    )
  }

  if (!response.ok) throw new ApiError(await errorMessage(response), response.status)

  try {
    return (await response.json()) as T
  } catch {
    throw new ApiError('The API returned a response that was not valid JSON.')
  }
}

/**
 * DELETE `path` and parse the JSON response. Always needs a token - every
 * route that accepts DELETE requires a signed-in owner.
 *
 * @param path  Path relative to API_BASE_URL, e.g. `/api/listings/5`.
 * @param token Bearer token identifying who's asking.
 */
export async function deleteJSON<T>(path: string, token: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
        'ngrok-skip-browser-warning': 'true',
        ...authHeaders(token),
      },
    })
  } catch {
    throw new ApiError(
      `Could not reach the API at ${API_BASE_URL}. Is the backend running?`,
    )
  }

  if (!response.ok) throw new ApiError(await errorMessage(response), response.status)

  try {
    return (await response.json()) as T
  } catch {
    throw new ApiError('The API returned a response that was not valid JSON.')
  }
}
