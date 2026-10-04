import { currentLang, t } from '../i18n'
/**
 * Thin fetch wrapper. Every backend call in the app goes through here so the
 * base URL, timeouts, error handling and JSON parsing live in one place.
 */

/**
 * When the page itself was loaded from "localhost", the backend defaults to
 * "localhost:8000" too. If a phone loads the page over LAN (e.g.
 * http://192.168.1.23:5173), assume the backend is on that same host, port
 * 8000. VITE_API_BASE_URL always overrides this.
 */
function defaultApiBase(): string {
  if (typeof window === 'undefined') return 'http://localhost:8000'
  const { protocol, hostname } = window.location
  if (hostname === 'localhost' || hostname === '127.0.0.1') return 'http://localhost:8000'
  return `${protocol}//${hostname}:8000`
}

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? defaultApiBase()).replace(/\/$/, '')

/** Fired when a request carrying a token comes back 401 - the session is
 * gone. AuthContext listens and signs out. */
export const UNAUTHORIZED_EVENT = 'banyan:unauthorized'

const DEFAULT_TIMEOUT_MS = 20_000

/** An HTTP or network failure. `status` is undefined for network failures
 * and timeouts - callers use that to fall back to cached data. */
export class ApiError extends Error {
  status?: number
  /** Seconds, from a 429's Retry-After header. */
  retryAfter?: number

  constructor(message: string, status?: number, retryAfter?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.retryAfter = retryAfter
  }
}

export function isNetworkError(error: unknown): boolean {
  return error instanceof ApiError && error.status === undefined
}

export function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

// Image hosts we're willing to load from. Anything else (e.g. a tracking
// pixel pasted into a listing) is treated as "no image".
const IMAGE_HOSTS = new Set([
  new URL(API_BASE_URL).host,
  'images.unsplash.com',
  'commons.wikimedia.org',
  'upload.wikimedia.org',
  'api.dicebear.com',
])

// Hosts that answer a cross-origin HEAD request, so we can show a photo's
// size before loading it. (commons.wikimedia.org redirects without CORS.)
const SIZE_CHECK_HOSTS = new Set([new URL(API_BASE_URL).host, 'images.unsplash.com', 'upload.wikimedia.org', 'api.dicebear.com'])

export function canCheckSize(url: string): boolean {
  try {
    return SIZE_CHECK_HOSTS.has(new URL(url).host)
  } catch {
    return false
  }
}

/** Uploaded photos come back API-relative ("/uploads/abc.jpg"). Returns
 * null for anything that isn't http(s) on an allowed host. */
export function resolveImageUrl(path: string | null | undefined): string | null {
  if (!path) return null
  try {
    const url = new URL(path, API_BASE_URL)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return IMAGE_HOSTS.has(url.host) ? url.toString() : null
  } catch {
    return null
  }
}

/** FastAPI errors are `{ "detail": "..." }`, or a list of validation errors. */
async function errorMessage(response: Response): Promise<string> {
  if (response.status === 429) return t('error.tooMany')
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
  if (response.status === 404) return t('error.notFound')
  return response.status >= 500 ? t('error.server') : t('error.failed')
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  params?: Record<string, string | number | boolean | undefined | null>
  json?: unknown
  form?: FormData
  token?: string | null
  signal?: AbortSignal
  timeoutMs?: number
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', params, json, form, token, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options

  const url = new URL(`${API_BASE_URL}${path}`)
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'ngrok-skip-browser-warning': 'true',
  }
  // Listings, bios, search cards and AI replies come back in this language.
  if (currentLang() !== 'en') headers['X-Lang'] = currentLang()
  if (token) headers.Authorization = `Bearer ${token}`
  // FormData bodies get their multipart Content-Type (with boundary) from the browser.
  if (json !== undefined) headers['Content-Type'] = 'application/json'

  // Our own controller, so a slow link times out instead of hanging, while
  // the caller's signal (navigation, a Cancel button) can still abort it.
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const onCallerAbort = () => controller.abort()
  if (signal?.aborted) controller.abort()
  signal?.addEventListener('abort', onCallerAbort)

  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers,
      signal: controller.signal,
      body: form ?? (json !== undefined ? JSON.stringify(json) : undefined),
    })
  } catch (error) {
    if (isAbort(error) && !timedOut) throw error
    throw new ApiError(
      timedOut
        ? t('error.timeout')
        : navigator.onLine
          ? t('error.unreachable')
          : t('error.offline'),
    )
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onCallerAbort)
  }

  if (!response.ok) {
    if (response.status === 401 && token) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    const retryAfter = Number(response.headers.get('Retry-After')) || undefined
    throw new ApiError(await errorMessage(response), response.status, retryAfter)
  }

  try {
    return (await response.json()) as T
  } catch {
    throw new ApiError(t('error.unreadable'))
  }
}

export function getJSON<T>(
  path: string,
  params?: RequestOptions['params'],
  signal?: AbortSignal,
  token?: string | null,
) {
  return request<T>(path, { params, signal, token })
}

export function postJSON<T>(path: string, body: unknown, token?: string | null) {
  return request<T>(path, { method: 'POST', json: body, token })
}

export function patchJSON<T>(path: string, body: unknown, token: string) {
  return request<T>(path, { method: 'PATCH', json: body, token })
}

export function deleteJSON<T>(path: string, token: string) {
  return request<T>(path, { method: 'DELETE', token })
}
