import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AI_TEXT_LIMIT } from '../../api/ai'
import { isAbort } from '../../api/client'
import { getListing } from '../../api/listings'
import { useCommunities } from '../../context/CommunityContext'
import { AssistantProvider, useAssistant, type ChatMessage } from '../../context/AssistantContext'
import { useOnline } from '../../hooks/useOnline'
import { flipFrom } from '../../lib/motion'
import Icon from '../Icon'
import { kindLabel, typeLabel, type Listing } from '../../types'
import { t } from '../../i18n'
import Trans from '../../i18n/Trans'

/** Listings the assistant pointed to, fetched by id from our own API. Ids
 * that don't exist are silently dropped, so the model can't invent any. */
function SuggestedListings({ ids }: { ids: number[] }) {
  const [listings, setListings] = useState<Listing[] | null>(null)
  const { describeDistance } = useCommunities()

  useEffect(() => {
    const controller = new AbortController()
    Promise.all(
      ids.map((id) =>
        getListing(String(id), controller.signal)
          .then((res) => res.data)
          .catch((error) => {
            if (isAbort(error)) throw error
            return null
          }),
      ),
    )
      .then((rows) => setListings(rows.filter((row): row is Listing => row !== null)))
      .catch(() => {})
    return () => controller.abort()
  }, [ids])

  if (!listings) return <p className="chat__hint">{t('chat.loadingListings')}</p>
  if (listings.length === 0) return null
  return (
    <ul className="chat__listings">
      {listings.map((listing) => (
        <li key={listing.id}>
          <Link to={`/listings/${encodeURIComponent(listing.id)}`}>{listing.title}</Link>
          <span>
            {typeLabel(listing.type)} · {kindLabel(listing)} · {describeDistance(listing).text}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Message({ message, onChip, disabled }: { message: ChatMessage; onChip: (label: string) => void; disabled: boolean }) {
  if (message.role === 'notice') return <li className="chat__notice">{message.text}</li>
  return (
    <li className={`chat__msg chat__msg--${message.role}`}>
      {/* Plain text only - model output is never rendered as HTML. */}
      <p>{message.text}</p>
      {message.role === 'assistant' && (
        <>
          {message.listingIds && message.listingIds.length > 0 && <SuggestedListings ids={message.listingIds} />}
          {message.chips && message.chips.length > 0 && (
            <div className="chat__chips">
              {message.chips.map((chip) => (
                <button key={chip.code} type="button" className="chip" disabled={disabled} onClick={() => onChip(chip.label)}>
                  {chip.label}
                </button>
              ))}
            </div>
          )}
          <span className="chat__label">{t('chat.aiLabel')}{message.demo ? ` · ${t('chat.demo')}` : ''}</span>
        </>
      )}
    </li>
  )
}

type PanelProps = { origin: DOMRect | null; onClose: () => void }

/**
 * The assistant panel. It asks clarifying questions, then points to real
 * listings. Offline, the history is read-only and a typed message waits
 * for an explicit "Send now". Loaded on first open (see AssistantLauncher).
 */
function AssistantPanel({ origin, onClose }: PanelProps) {
  const assistant = useAssistant()
  const online = useOnline()
  const [draft, setDraft] = useState('')
  const panelRef = useRef<HTMLElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // FLIP: grow out of the launcher button.
  useLayoutEffect(() => {
    if (panelRef.current && origin) flipFrom(panelRef.current, origin)
    inputRef.current?.focus()
  }, [origin])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [assistant.messages.length, assistant.pending])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const busy = assistant.pending || assistant.coolingDown
  const submit = (text: string) => {
    if (!text.trim()) return
    assistant.send(text)
    setDraft('')
  }

  return (
    <section className="chat" role="dialog" aria-label={t('chat.dialog')} ref={panelRef}>
      <header className="chat__header">
        <strong>{t('chat.title')}</strong>
        <span className="chat__sub">{t('chat.sub')}</span>
        <div className="chat__actions">
          <button type="button" className="link-button" onClick={assistant.reset}>
            {t('chat.new')}
          </button>
          <button type="button" className="icon-button" onClick={onClose} aria-label={t('chat.close')}>
            <Icon name="x" />
          </button>
        </div>
      </header>

      <ul className="chat__messages" ref={listRef} aria-live="polite">
        {assistant.messages.length === 0 && (
          <li className="chat__notice">
            {t('chat.try')}
          </li>
        )}
        {assistant.messages.map((message) => (
          <Message key={message.id} message={message} onChip={submit} disabled={busy || !online} />
        ))}
        {assistant.pending && (
          <li className="chat__notice">
            {t('chat.thinking')}{' '}
            <button type="button" className="link-button" onClick={assistant.cancel}>
              {t('chat.stop')}
            </button>
          </li>
        )}
      </ul>

      {assistant.failedTurns >= 2 && (
        <div className="chat__handoff">
          <Trans
            k="chat.handoff"
            tags={{
              browse: (text) => (
                <Link to="/search" onClick={onClose}>
                  {text}
                </Link>
              ),
              report: (text) => (
                <button type="button" className="link-button" onClick={() => assistant.report('Assistant could not help')}>
                  {text}
                </button>
              ),
            }}
          />
        </div>
      )}

      {assistant.unsent && (
        <div className="chat__unsent" role="status">
          {t('chat.notSent', { text: assistant.unsent })}
          <div>
            <button type="button" className="secondary-button" disabled={!online} onClick={assistant.sendUnsent}>
              {online ? t('chat.sendNow') : t('chat.waiting')}
            </button>
            <button type="button" className="link-button" onClick={assistant.discardUnsent}>
              {t('chat.discard')}
            </button>
          </div>
        </div>
      )}

      <form
        className="chat__form"
        onSubmit={(event) => {
          event.preventDefault()
          submit(draft)
        }}
      >
        <input
          ref={inputRef}
          value={draft}
          maxLength={AI_TEXT_LIMIT}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={online ? t('chat.placeholder') : t('chat.placeholderOffline')}
          aria-label={t('chat.inputLabel')}
          disabled={assistant.pending}
        />
        <button type="submit" className="primary-button" disabled={busy || !draft.trim()}>
          {t('chat.send')}
        </button>
      </form>
      <p className="chat__footnote">
        {draft.length}/{AI_TEXT_LIMIT} · {t('chat.privacy')}
      </p>
    </section>
  )
}

/** Lazy-loaded entry: the conversation state lives with the panel, so none
 * of the assistant's code is in the first page load. */
export default function Assistant(props: PanelProps) {
  return (
    <AssistantProvider>
      <AssistantPanel {...props} />
    </AssistantProvider>
  )
}
