import { isNetworkError } from './client'

/**
 * Keeps the last good response for a request in localStorage, so on a
 * dropped satellite link the app still shows what it saw last time instead
 * of an error. Only text is cached - images are never stored here.
 */

const PREFIX = 'byproduct.cache.'

type Entry<T> = { data: T; savedAt: number }

/** `cachedAt` is null for a fresh response, or when the cached copy was saved. */
export type Cached<T> = { data: T; cachedAt: number | null }

export function readCache<T>(key: string): Entry<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as Entry<T>) : null
  } catch {
    return null
  }
}

function writeCache<T>(key: string, data: T) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ data, savedAt: Date.now() }))
  } catch {
    // Storage full or blocked - the app just won't work offline.
  }
}

/**
 * Run `fetcher`; on success cache the result under `key`. On a network
 * failure (not an HTTP error), return `fallback()` if it finds anything.
 */
export async function withOfflineCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  fallback: () => Entry<T> | null = () => readCache<T>(key),
): Promise<Cached<T>> {
  try {
    const data = await fetcher()
    writeCache(key, data)
    return { data, cachedAt: null }
  } catch (error) {
    if (isNetworkError(error)) {
      const cached = fallback()
      if (cached) return { data: cached.data, cachedAt: cached.savedAt }
    }
    throw error
  }
}
