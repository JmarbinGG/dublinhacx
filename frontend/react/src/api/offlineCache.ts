import { isNetworkError } from './client'

/**
 * Keeps the last good response for a request in localStorage, so on a
 * dropped connection the app still shows what it saw last time instead of an
 * error. Only text is cached - never images. Old entries are evicted so
 * storage can't fill up silently.
 */

const PREFIX = 'banyan.cache.'
const MAX_ENTRIES = 40

type Entry<T> = { data: T; savedAt: number }

/** `cachedAt` is null for a fresh response, else when the saved copy was made. */
export type Cached<T> = { data: T; cachedAt: number | null }

export function readCache<T>(key: string): Entry<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as Entry<T>) : null
  } catch {
    return null
  }
}

function evict() {
  const entries: { key: string; savedAt: number }[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith(PREFIX)) continue
    try {
      entries.push({ key, savedAt: (JSON.parse(localStorage.getItem(key) ?? '{}') as Entry<unknown>).savedAt ?? 0 })
    } catch {
      entries.push({ key, savedAt: 0 })
    }
  }
  entries
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(MAX_ENTRIES)
    .forEach(({ key }) => localStorage.removeItem(key))
}

export function writeCache<T>(key: string, data: T) {
  const value = JSON.stringify({ data, savedAt: Date.now() })
  try {
    localStorage.setItem(PREFIX + key, value)
    evict()
  } catch {
    // Storage full - drop old entries and try once more, else give up.
    try {
      evict()
      localStorage.setItem(PREFIX + key, value)
    } catch {
      // The app just won't have this response offline.
    }
  }
}

/**
 * Run `fetcher`; on success cache the result under `key`. On a network
 * failure (never an HTTP error), return `fallback()` if it finds anything.
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

/** Every listing saved in any cached response, de-duplicated - the offline
 * search pool. Text only; nothing here triggers a download. */
export function cachedListings<T extends { id: number; title: string }>(): { rows: T[]; savedAt: number | null } {
  const byId = new Map<number, T>()
  let savedAt: number | null = null
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith(PREFIX)) continue
    try {
      const entry = JSON.parse(localStorage.getItem(key) ?? '') as Entry<unknown>
      const data = entry.data as { listings?: unknown } | unknown[]
      const rows = Array.isArray(data) ? data : Array.isArray((data as { listings?: unknown })?.listings) ? ((data as { listings: unknown[] }).listings) : []
      for (const row of rows as T[]) {
        if (row && typeof row.id === 'number' && typeof row.title === 'string') byId.set(row.id, row)
      }
      if (rows.length) savedAt = Math.max(savedAt ?? 0, entry.savedAt)
    } catch {
      // Skip unreadable entries.
    }
  }
  return { rows: [...byId.values()], savedAt }
}
