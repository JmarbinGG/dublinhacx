import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useOnline } from '../hooks/useOnline'
import { QUEUE_CHANGED_EVENT, flushQueue, readQueue } from '../offline/syncQueue'

const pendingCount = () => readQueue().filter((entry) => !entry.error).length

/**
 * Offline banner + background posting. Whenever we're online and signed in,
 * listings queued offline are posted; the banner says how many are waiting.
 */
export default function ConnectionStatus() {
  const online = useOnline()
  const { token } = useAuth()
  const [pending, setPending] = useState(pendingCount)
  const [justSynced, setJustSynced] = useState(0)

  useEffect(() => {
    const update = () => setPending(pendingCount())
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

  const plural = (n: number) => `${n} listing${n === 1 ? '' : 's'}`

  if (!online) {
    return (
      <div className="connection-banner connection-banner--offline" role="status">
        You're offline - showing saved listings.
        {pending > 0 && ` ${plural(pending)} will post when you reconnect.`}
      </div>
    )
  }

  if (pending > 0 && !token) {
    return (
      <div className="connection-banner" role="status">
        {plural(pending)} waiting to post - sign in to send them.
      </div>
    )
  }

  if (justSynced > 0) {
    return (
      <div className="connection-banner connection-banner--ok" role="status">
        Back online - posted {plural(justSynced)} saved while offline.
        <button type="button" className="link-button" onClick={() => setJustSynced(0)}>
          Dismiss
        </button>
      </div>
    )
  }

  return null
}
