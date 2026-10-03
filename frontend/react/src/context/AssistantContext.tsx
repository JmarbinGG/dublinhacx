import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  AI_TEXT_LIMIT,
  cleanText,
  redactPersonal,
  reportAssistant,
  sendAssistantMessage,
  SessionExpiredError,
  startAssistantSession,
  type AssistantChip,
} from '../api/ai'
import { isAbort } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { randomId } from '../lib/geo'
import { useCommunities } from './CommunityContext'
import { AI_ANSWER_KB, useDataBudget } from './DataBudgetContext'

/**
 * The assistant's conversation. The server owns the real history - the
 * client only ever sends the new message plus the server-issued session id.
 * The last messages are kept in localStorage so they survive a reload and
 * can be read (not continued) offline.
 */

const STORAGE_KEY = 'banyan.assistant'
const KEEP_MESSAGES = 30
const MAX_USER_MESSAGES_PER_SESSION = 20
const COOLDOWN_MS = 1500

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'notice'
  text: string
  chips?: AssistantChip[]
  listingIds?: number[]
  demo?: boolean
}

type Stored = { sessionId: string | null; messages: ChatMessage[]; unsent: string | null }

function readStored(): Stored {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Stored | null
    if (raw && Array.isArray(raw.messages)) {
      return { sessionId: raw.sessionId ?? null, messages: raw.messages.slice(-KEEP_MESSAGES), unsent: raw.unsent ?? null }
    }
  } catch {
    // Fall through to a fresh conversation.
  }
  return { sessionId: null, messages: [], unsent: null }
}

type AssistantValue = {
  messages: ChatMessage[]
  pending: boolean
  /** A message typed while offline, waiting for the user to press "Send now". */
  unsent: string | null
  /** Consecutive turns that errored or found nothing - triggers the handoff. */
  failedTurns: number
  coolingDown: boolean
  send: (text: string) => Promise<void>
  sendUnsent: () => void
  discardUnsent: () => void
  cancel: () => void
  reset: () => void
  report: (reason: string) => Promise<void>
}

const AssistantContext = createContext<AssistantValue | null>(null)

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth()
  const { home } = useCommunities()
  const { recordAi } = useDataBudget()
  const [stored, setStored] = useState<Stored>(readStored)
  const [pending, setPending] = useState(false)
  const [failedTurns, setFailedTurns] = useState(0)
  const [coolingDown, setCoolingDown] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...stored, messages: stored.messages.slice(-KEEP_MESSAGES) }))
    } catch {
      // Not persisted.
    }
  }, [stored])

  const add = (...messages: Omit<ChatMessage, 'id'>[]) =>
    setStored((prev) => ({
      ...prev,
      messages: [...prev.messages, ...messages.map((m) => ({ ...m, id: randomId() }))].slice(-KEEP_MESSAGES),
    }))

  const value = useMemo<AssistantValue>(() => {
    async function send(raw: string) {
      const cleaned = cleanText(raw, AI_TEXT_LIMIT)
      if (!cleaned || pending || coolingDown) return

      const userCount = stored.messages.filter((m) => m.role === 'user').length
      if (stored.sessionId && userCount >= MAX_USER_MESSAGES_PER_SESSION) {
        add({ role: 'notice', text: 'This chat is getting long - start a new one to keep going.' })
        return
      }

      const { text, redacted } = redactPersonal(cleaned)
      if (!navigator.onLine) {
        setStored((prev) => ({ ...prev, unsent: text }))
        return
      }

      setCoolingDown(true)
      setTimeout(() => setCoolingDown(false), COOLDOWN_MS)
      add({ role: 'user', text })
      if (redacted) add({ role: 'notice', text: 'Contact details and locations are never sent to the assistant, so they were removed.' })

      const controller = new AbortController()
      controllerRef.current = controller
      setPending(true)
      try {
        let sessionId = stored.sessionId
        if (!sessionId) {
          sessionId = await startAssistantSession(token)
          setStored((prev) => ({ ...prev, sessionId }))
        }
        // Community name only - never coordinates, email or phone.
        let reply
        try {
          reply = await sendAssistantMessage(sessionId, text, home, token, controller.signal)
        } catch (error) {
          if (!(error instanceof SessionExpiredError)) throw error
          // The server expired the session: start a fresh one and resend once.
          sessionId = await startAssistantSession(token)
          setStored((prev) => ({ ...prev, sessionId }))
          add({ role: 'notice', text: 'Started a new chat session.' })
          reply = await sendAssistantMessage(sessionId, text, home, token, controller.signal)
        }
        add({ role: 'assistant', text: reply.text, chips: reply.chips, listingIds: reply.listing_ids, demo: reply.demo })
        if (!reply.demo) recordAi(AI_ANSWER_KB)
        setFailedTurns((n) => (reply.listing_ids.length === 0 && reply.chips.length === 0 ? n + 1 : 0))
      } catch (error) {
        if (isAbort(error)) {
          add({ role: 'notice', text: 'Stopped.' })
          return
        }
        add({ role: 'notice', text: error instanceof Error ? error.message : 'The assistant had a problem.' })
        setFailedTurns((n) => n + 1)
      } finally {
        setPending(false)
      }
    }

    return {
      messages: stored.messages,
      pending,
      unsent: stored.unsent,
      failedTurns,
      coolingDown,
      send,
      sendUnsent() {
        const text = stored.unsent
        setStored((prev) => ({ ...prev, unsent: null }))
        if (text) send(text)
      },
      discardUnsent: () => setStored((prev) => ({ ...prev, unsent: null })),
      cancel: () => controllerRef.current?.abort(),
      reset() {
        controllerRef.current?.abort()
        setFailedTurns(0)
        setStored({ sessionId: null, messages: [], unsent: null })
      },
      async report(reason) {
        if (stored.sessionId) await reportAssistant(stored.sessionId, reason, token).catch(() => {})
        add({ role: 'notice', text: 'Thanks - the problem was reported.' })
        setFailedTurns(0)
      },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored, pending, failedTurns, coolingDown, token, home, recordAi])

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>
}

export function useAssistant(): AssistantValue {
  const context = useContext(AssistantContext)
  if (!context) throw new Error('useAssistant must be used inside <AssistantProvider>')
  return context
}
