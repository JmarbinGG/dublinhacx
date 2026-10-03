import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { QUEUE_CHANGED_EVENT, flushQueue, readQueue } from '../offline/syncQueue'

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}

/**
 * Offline banner + background sync. Whenever we're online and signed in,
 * listings queued offline are sent; the banner says how many are waiting.
 */
export default function ConnectionStatus() {
  const online = useOnline()
  const { token } = useAuth()
  const [pending, setPending] = useState(() => readQueue().filter((entry) => !entry.error).length)
  const [justSynced, setJustSynced] = useState(0)

  useEffect(() => {
    const update = () => setPending(readQueue().filter((entry) => !entry.error).length)
    window.addEventListener(QUEUE_CHANGED_EVENT, update)
    return () => window.removeEventListener(QUEUE_CHANGED_EVENT, update)
  }, [])

  useEffect(() => {
    if (!online || !token || pending === 0) return
    let cancelled = false
    flushQueue(token).then((count) => {
      if (!cancelled && count > 0) setJustSynced(count)
    })
    return () => {
      cancelled = true
    }
  }, [online, token, pending])

  if (!online) {
    return (
      <div className="connection-banner connection-banner--offline" role="status">
        You're offline - showing saved listings.
        {pending > 0 && ` ${pending} new listing${pending === 1 ? '' : 's'} will post when you reconnect.`}
      </div>
    )
  }

  if (pending > 0 && !token) {
    return (
      <div className="connection-banner" role="status">
        {pending} listing{pending === 1 ? '' : 's'} waiting to post - sign in to send{' '}
        {pending === 1 ? 'it' : 'them'}.
      </div>
    )
  }

  if (justSynced > 0) {
    return (
      <div className="connection-banner connection-banner--ok" role="status">
        Back online - posted {justSynced} listing{justSynced === 1 ? '' : 's'} saved while offline.
        <button type="button" className="link-button" onClick={() => setJustSynced(0)}>
          Dismiss
        </button>
      </div>
    )
  }

  return null
}
