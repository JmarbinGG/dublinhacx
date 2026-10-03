import { syncItems, type NewItem } from '../api/items'
import { randomId } from '../lib/geo'

/**
 * Listings created with no connection wait here (localStorage) and are sent
 * to POST /api/sync once the device is back online. Each entry carries a
 * client-generated id, so a sync that dies halfway can be retried safely -
 * the server won't create duplicates.
 */

const STORAGE_KEY = 'byproduct.syncQueue'
export const QUEUE_CHANGED_EVENT = 'byproduct:queue'

export type QueuedItem = {
  client_id: string
  item: NewItem
  queuedAt: number
  /** Set when the server rejected it - the user has to fix or discard it. */
  error?: string
}

export function readQueue(): QueuedItem[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as QueuedItem[]
  } catch {
    return []
  }
}

function writeQueue(queue: QueuedItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
  } catch {
    // Storage full or blocked - nothing more we can do.
  }
  window.dispatchEvent(new Event(QUEUE_CHANGED_EVENT))
}

export function enqueueItem(item: NewItem) {
  writeQueue([...readQueue(), { client_id: randomId(), item, queuedAt: Date.now() }])
}

export function discardQueued(clientId: string) {
  writeQueue(readQueue().filter((entry) => entry.client_id !== clientId))
}

let flushing = false

/** Send everything pending. Returns how many were synced. */
export async function flushQueue(token: string): Promise<number> {
  const pending = readQueue().filter((entry) => !entry.error)
  if (flushing || pending.length === 0 || !navigator.onLine) return 0

  flushing = true
  try {
    const { results } = await syncItems(
      pending.map(({ client_id, item }) => ({ client_id, item })),
      token,
    )
    const byId = new Map(results.map((result) => [result.client_id, result]))
    const remaining = readQueue()
      .filter((entry) => byId.get(entry.client_id)?.status !== 'synced')
      .map((entry) => {
        const result = byId.get(entry.client_id)
        return result?.status === 'error' ? { ...entry, error: result.detail ?? 'Rejected' } : entry
      })
    writeQueue(remaining)
    return results.filter((result) => result.status === 'synced').length
  } catch {
    // Still offline / server down - try again on the next 'online' event.
    return 0
  } finally {
    flushing = false
  }
}
