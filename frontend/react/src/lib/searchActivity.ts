import { useSyncExternalStore } from 'react'

/**
 * Whether a search request is running, and how to cancel it - shared so the
 * search icon in the top bar can turn into Cancel while results load.
 */
let cancelFn: (() => void) | null = null
const listeners = new Set<() => void>()

export function setSearchBusy(cancel: (() => void) | null) {
  cancelFn = cancel
  listeners.forEach((l) => l())
}

export function cancelSearch() {
  cancelFn?.()
}

export function useSearchBusy(): boolean {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => cancelFn !== null,
  )
}
