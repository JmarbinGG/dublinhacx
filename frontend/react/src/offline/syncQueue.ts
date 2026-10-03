import { isNetworkError } from '../api/client'
import { createListing, type ListingInput } from '../api/listings'
import { randomId } from '../lib/geo'

/**
 * Listings created with no connection wait here (localStorage) and are
 * posted once the device is back online. Photos can't be queued - only text.
 */

const STORAGE_KEY = 'banyan.syncQueue'
export const QUEUE_CHANGED_EVENT = 'banyan:queue'

export type QueuedListing = {
  client_id: string
  listing: ListingInput
  queuedAt: number
  /** Set when the server rejected it - the user has to discard it. */
  error?: string
}

export function readQueue(): QueuedListing[] {
  try {
    const queue = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as QueuedListing[]
    return Array.isArray(queue) ? queue.filter((entry) => entry?.listing?.title) : []
  } catch {
    return []
  }
}

function writeQueue(queue: QueuedListing[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
  } catch {
    // Storage full or blocked.
  }
  window.dispatchEvent(new Event(QUEUE_CHANGED_EVENT))
}

export function enqueueListing(listing: ListingInput) {
  writeQueue([...readQueue(), { client_id: randomId(), listing, queuedAt: Date.now() }])
}

export function discardQueued(clientId: string) {
  writeQueue(readQueue().filter((entry) => entry.client_id !== clientId))
}

let flushing = false

/** Post everything pending, oldest first. Returns how many were posted. */
export async function flushQueue(token: string): Promise<number> {
  if (flushing || !navigator.onLine) return 0
  flushing = true
  let posted = 0
  try {
    for (const entry of readQueue().filter((e) => !e.error)) {
      try {
        await createListing(entry.listing, token)
        discardQueued(entry.client_id)
        posted++
      } catch (error) {
        if (isNetworkError(error)) break // Still offline - try again later.
        writeQueue(
          readQueue().map((e) =>
            e.client_id === entry.client_id
              ? { ...e, error: error instanceof Error ? error.message : 'Rejected' }
              : e,
          ),
        )
      }
    }
  } finally {
    flushing = false
  }
  return posted
}
