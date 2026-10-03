import { ApiError, request } from './client'
import { readCache, writeCache, type Cached } from './offlineCache'
import { mockAssistantReply, mockOverview } from './aiMock'

/**
 * Proposed AI endpoints (not on the backend yet - see FRONTEND_AI_CONTRACT.md):
 *
 *   POST /api/search/ai           { q, filters, community }  -> AiOverview
 *   POST /api/assistant/session   {}                          -> { session_id }
 *   POST /api/assistant/chat      { session_id, message, community? } -> AssistantReply
 *   POST /api/assistant/report    { session_id, reason }      -> { ok }
 *
 * Every response is schema-checked here; anything malformed is rejected, and
 * ids are only trusted after the caller matches them against real listings.
 *
 * In `npm run dev`, a 404 (backend hasn't added the route yet) falls back to
 * a local demo so the UI can be exercised. Demo answers are labelled as such.
 */

export { AI_TEXT_LIMIT, QUERY_LIMIT, cleanText, redactPersonal } from '../lib/text'
import { AI_TEXT_LIMIT, QUERY_LIMIT, cleanText } from '../lib/text'

export type AiPick = { id: number; why: string }

export type AiOverview = {
  summary: string
  picks: AiPick[]
  caveats: string[]
  engine: string
  demo?: boolean
}

export type AssistantChip = { code: string; label: string }

export type AssistantReply = {
  text: string
  chips: AssistantChip[]
  listing_ids: number[]
  demo?: boolean
}

export class AiUnavailableError extends Error {
  constructor() {
    super('The AI assistant isn\'t available right now. Regular search still works.')
    this.name = 'AiUnavailableError'
  }
}

// ---- schema checks (plain code, no dependency) ----

const isString = (v: unknown): v is string => typeof v === 'string'
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}…` : s)

function parseOverview(raw: unknown): AiOverview {
  const body = raw as Record<string, unknown> | null
  if (!body || !isString(body.summary) || !Array.isArray(body.picks)) throw new AiUnavailableError()
  const picks = body.picks
    .filter((p): p is { id: unknown; why: unknown } => !!p && typeof p === 'object')
    .map((p) => ({ id: Number(p.id), why: isString(p.why) ? clip(p.why, 300) : '' }))
    .filter((p) => Number.isInteger(p.id) && p.id > 0)
    .slice(0, 6)
  const caveats = Array.isArray(body.caveats) ? body.caveats.filter(isString).map((c) => clip(c, 200)).slice(0, 4) : []
  return {
    summary: clip(body.summary, 1200),
    picks,
    caveats,
    engine: isString(body.engine) ? body.engine : 'ai',
    demo: body.demo === true,
  }
}

function parseReply(raw: unknown): AssistantReply {
  const body = raw as Record<string, unknown> | null
  if (!body || !isString(body.text)) throw new AiUnavailableError()
  const chips = Array.isArray(body.chips)
    ? body.chips
        .filter((c): c is { code: unknown; label: unknown } => !!c && typeof c === 'object')
        .filter((c) => isString(c.code) && isString(c.label))
        .map((c) => ({ code: clip(c.code as string, 40), label: clip(c.label as string, 40) }))
        .slice(0, 6)
    : []
  const ids = Array.isArray(body.listing_ids)
    ? body.listing_ids.map(Number).filter((id) => Number.isInteger(id) && id > 0).slice(0, 6)
    : []
  return { text: clip(body.text, 1500), chips, listing_ids: ids, demo: body.demo === true }
}

// ---- helpers ----

const shouldUseDemo = (error: unknown) => import.meta.env.DEV && error instanceof ApiError && error.status === 404

function wrapAiError(error: unknown): never {
  if (error instanceof ApiError && (error.status === 404 || (error.status ?? 0) >= 500)) {
    throw new AiUnavailableError()
  }
  throw error
}

// ---- AI search overview ----

export type OverviewFilters = { type?: string; kind?: string; exchange?: string; scope?: string }

export async function aiOverview(
  q: string,
  filters: OverviewFilters,
  community: string | null,
  token: string | null,
  signal?: AbortSignal,
): Promise<Cached<AiOverview>> {
  const query = cleanText(q, QUERY_LIMIT)
  // Own cache namespace (never the listings keys); failures are never cached.
  const key = `ai-overview:${JSON.stringify([query.toLowerCase(), filters, community])}`
  try {
    const raw = await request<unknown>('/api/search/ai', {
      method: 'POST',
      json: { q: query, filters, community },
      token,
      signal,
      timeoutMs: 20_000,
    })
    const data = parseOverview(raw)
    writeCache(key, data)
    return { data, cachedAt: null }
  } catch (error) {
    if (shouldUseDemo(error)) {
      const data = parseOverview(await mockOverview(query, filters, community, signal))
      return { data, cachedAt: null }
    }
    if (error instanceof ApiError && error.status === undefined) {
      const cached = readCache<AiOverview>(key)
      if (cached) return { data: cached.data, cachedAt: cached.savedAt }
    }
    wrapAiError(error)
  }
}

// ---- assistant ----

export async function startAssistantSession(token: string | null): Promise<string> {
  try {
    const raw = await request<{ session_id?: unknown }>('/api/assistant/session', { method: 'POST', json: {}, token })
    if (!isString(raw.session_id) || raw.session_id.length > 128) throw new AiUnavailableError()
    return raw.session_id
  } catch (error) {
    if (shouldUseDemo(error)) return `demo-${Date.now().toString(36)}`
    wrapAiError(error)
  }
}

export async function sendAssistantMessage(
  sessionId: string,
  message: string,
  community: string | null,
  token: string | null,
  signal?: AbortSignal,
): Promise<AssistantReply> {
  if (sessionId.startsWith('demo-')) return parseReply(await mockAssistantReply(message, community, signal))
  try {
    const raw = await request<unknown>('/api/assistant/chat', {
      method: 'POST',
      json: { session_id: sessionId, message, community },
      token,
      signal,
    })
    return parseReply(raw)
  } catch (error) {
    wrapAiError(error)
  }
}

export async function reportAssistant(sessionId: string, reason: string, token: string | null): Promise<void> {
  if (sessionId.startsWith('demo-')) return
  await request('/api/assistant/report', {
    method: 'POST',
    json: { session_id: sessionId, reason: cleanText(reason, AI_TEXT_LIMIT) },
    token,
  })
}
