import { ApiError, request } from './client'
import { mockAssistantReply } from './aiMock'

/**
 * Assistant endpoints (proposed - see FRONTEND_AI_CONTRACT.md). The UI for
 * them is behind VITE_ENABLE_ASSISTANT until the backend confirms they stay.
 *
 *   POST /api/assistant/session   {}                                  -> { session_id }
 *   POST /api/assistant/chat      { session_id, message, community? } -> AssistantReply
 *   POST /api/assistant/report    { session_id, reason }              -> { ok }
 *
 * Every response is schema-checked; listing ids are only trusted after the
 * caller re-fetches them. In `npm run dev`, a 404 from the session route
 * falls back to a labelled local demo.
 */

export { AI_TEXT_LIMIT, QUERY_LIMIT, cleanText, redactPersonal } from '../lib/text'
import { AI_TEXT_LIMIT, cleanText } from '../lib/text'
import { t } from '../i18n'

export type AssistantChip = { code: string; label: string }

export type AssistantReply = {
  text: string
  chips: AssistantChip[]
  listing_ids: number[]
  demo?: boolean
}

export class AiUnavailableError extends Error {
  constructor(message = "The assistant isn't available right now. Search still works.") {
    super(message)
    this.name = 'AiUnavailableError'
  }
}

/** The server forgot the session (404/410) - start a new one. */
export class SessionExpiredError extends Error {}

const isString = (v: unknown): v is string => typeof v === 'string'
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}…` : s)

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

const shouldUseDemo = (error: unknown) => import.meta.env.DEV && error instanceof ApiError && error.status === 404

/** Map session-call failures to messages the user can act on. */
function wrapAiError(error: unknown): never {
  if (error instanceof ApiError) {
    if (error.status === 404 || error.status === 410) throw new SessionExpiredError()
    if (error.status === 409) throw new AiUnavailableError(t('chat.busy'))
    if (error.status === 429) {
      throw new AiUnavailableError(
        `The assistant is busy. Try again${error.retryAfter ? ` in ${error.retryAfter} seconds` : ' shortly'}.`,
      )
    }
    if ((error.status ?? 0) >= 500) throw new AiUnavailableError()
  }
  throw error
}

export async function startAssistantSession(token: string | null): Promise<string> {
  try {
    const raw = await request<{ session_id?: unknown }>('/api/assistant/session', { method: 'POST', json: {}, token })
    if (!isString(raw.session_id) || raw.session_id.length > 128) throw new AiUnavailableError()
    return raw.session_id
  } catch (error) {
    if (shouldUseDemo(error)) return `demo-${Date.now().toString(36)}`
    if (error instanceof ApiError && error.status === 404) throw new AiUnavailableError()
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
