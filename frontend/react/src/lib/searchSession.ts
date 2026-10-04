import type { SearchState } from '../api/smartSearch'

/**
 * Follow-ups in the one search bar. When someone types into the bar while
 * looking at results ("only free ones", "closer than 20 km"), that text is
 * sent together with the previous result's state, and the SERVER decides
 * whether it's a new search or narrows the previous one. The client never
 * interprets the words.
 *
 * Kept in memory only (the URL holds just the latest text). Each query
 * remembers the state it was typed on top of, so back/forward replays the
 * exact same request - which the cache then answers for free.
 */
let latest: SearchState | null = null
const baseFor = new Map<string, SearchState | null>()

/** The state the last search produced (what a follow-up builds on). */
export function rememberResult(state: SearchState | null) {
  latest = state
}

/** Called by the search bar on submit: a follow-up when typed on /search. */
export function noteSubmit(q: string, followUp: boolean) {
  baseFor.set(q, followUp ? latest : null)
}

/** The state `q` was typed on top of (null = a fresh search). */
export function baseOf(q: string): SearchState | null {
  return baseFor.get(q) ?? null
}

/** The server ignored the previous state (older backend): treat as fresh. */
export function forgetBase(q: string) {
  baseFor.set(q, null)
}
