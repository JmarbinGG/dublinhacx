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

/** Fired when a request carrying a token comes back 401 - the session
 * expired or the server restarted. AuthContext listens and signs out. */
export const UNAUTHORIZED_EVENT = 'byproduct:unauthorized'

/** An HTTP or network failure. `status` is undefined for network failures
 * (offline, server down) - callers use that to fall back to cached data. */
export class ApiError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function isNetworkError(error: unknown): boolean {
  return error instanceof ApiError && error.status === undefined
}

/** Uploaded photos come back API-relative ("/uploads/abc.jpg"); seed images
 * are absolute URLs. Either way, make it usable in <img src>. */
export function resolveImageUrl(path: string): string {
  return /^https?:\/\//.test(path) ? path : `${API_BASE_URL}${path}`
}

/** FastAPI errors are `{ "detail": "..." }`, or a list of validation errors. */
async function errorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json()
    const detail = (body as { detail?: unknown } | null)?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { loc?: unknown[]; msg?: string }
      const field = first.loc?.[first.loc.length - 1]
      return field ? `${String(field).replace(/_/g, ' ')}: ${first.msg}` : String(first.msg)
    }
  } catch {
    // Body wasn't JSON - fall through to the generic message below.
  }
  return response.status === 404
    ? 'Not found.'
    : `The API returned ${response.status} ${response.statusText}.`
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'DELETE'
  params?: Record<string, string | number | undefined | null>
  json?: unknown
  form?: FormData
  token?: string | null
  signal?: AbortSignal
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', params, json, form, token, signal } = options

  const url = new URL(`${API_BASE_URL}${path}`)
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'ngrok-skip-browser-warning': 'true',
  }
  if (token) headers.Authorization = `Bearer ${token}`
  // FormData bodies get their multipart Content-Type (with boundary) from the browser.
  if (json !== undefined) headers['Content-Type'] = 'application/json'

  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers,
      signal,
      body: form ?? (json !== undefined ? JSON.stringify(json) : undefined),
    })
  } catch (error) {
    // AbortError means we cancelled on purpose - let callers ignore it.
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(
      navigator.onLine
        ? `Could not reach the server at ${API_BASE_URL}.`
        : "You're offline.",
    )
  }

  if (!response.ok) {
    if (response.status === 401 && token) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    throw new ApiError(await errorMessage(response), response.status)
  }

  try {
    return (await response.json()) as T
  } catch {
    throw new ApiError('The server returned a response that was not valid JSON.')
  }
}
