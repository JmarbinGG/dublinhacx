import type { Category, Community, Item } from '../types'
import { request } from './client'
import { readCache, withOfflineCache, type Cached } from './offlineCache'

/**
 * Backend routes (see backend/main.py):
 *
 *   GET    /api/communities        every community, with lat/lng
 *   GET    /api/items?q=&category= newest first; q also matches synonyms
 *   GET    /api/items/mine         the signed-in user's listings (401 signed out)
 *   GET    /api/items/<id>         one listing; contact_email only when signed in
 *   POST   /api/items              create (signed in)
 *   DELETE /api/items/<id>         delete your own listing (403 otherwise)
 *   POST   /api/sync               replay listings queued while offline
 */

const ALL_ITEMS_KEY = 'items:all'

export function listCommunities(signal?: AbortSignal): Promise<Cached<Community[]>> {
  return withOfflineCache('communities', () => request<Community[]>('/api/communities', { signal }))
}

/** Offline, a search falls back to filtering the last full list locally. */
export function listItems(query: string, signal?: AbortSignal): Promise<Cached<Item[]>> {
  const q = query.trim()
  if (!q) {
    return withOfflineCache(ALL_ITEMS_KEY, () => request<Item[]>('/api/items', { signal }))
  }
  return withOfflineCache(
    `items:q:${q.toLowerCase()}`,
    () => request<Item[]>('/api/items', { params: { q }, signal }),
    () => readCache<Item[]>(`items:q:${q.toLowerCase()}`) ?? localSearch(q),
  )
}

function localSearch(q: string) {
  const all = readCache<Item[]>(ALL_ITEMS_KEY)
  if (!all) return null
  const needle = q.toLowerCase()
  const data = all.data.filter((item) =>
    [item.title, item.description, item.category, item.tags, item.price_or_exchange]
      .some((field) => field?.toLowerCase().includes(needle)),
  )
  return { data, savedAt: all.savedAt }
}

/** Offline, a listing seen in the last full list can still be opened. */
export function getItem(id: string, token: string | null, signal?: AbortSignal): Promise<Cached<Item>> {
  return withOfflineCache(
    `item:${id}`,
    () => request<Item>(`/api/items/${encodeURIComponent(id)}`, { token, signal }),
    () => {
      const all = readCache<Item[]>(ALL_ITEMS_KEY)
      const item = all?.data.find((row) => row.id === id)
      return item && all ? { data: item, savedAt: all.savedAt } : null
    },
  )
}

export type NewItem = {
  community_id: string
  category: Category
  title: string
  description?: string
  price_or_exchange?: string
  quantity?: string
  tags?: string
  contact_email?: string
  image_url?: string
}

export function createItem(item: NewItem, token: string): Promise<Item> {
  return request<Item>('/api/items', { method: 'POST', json: item, token })
}

export function getMyItems(token: string, signal?: AbortSignal): Promise<Item[]> {
  return request<Item[]>('/api/items/mine', { token, signal })
}

export function deleteItem(id: string, token: string): Promise<{ status: string }> {
  return request(`/api/items/${encodeURIComponent(id)}`, { method: 'DELETE', token })
}

export type SyncResult = {
  client_id: string
  status: 'synced' | 'error'
  item_id?: string
  detail?: string
}

export function syncItems(
  entries: { client_id: string; item: NewItem }[],
  token: string,
): Promise<{ results: SyncResult[] }> {
  return request('/api/sync', { method: 'POST', json: { entries }, token })
}
