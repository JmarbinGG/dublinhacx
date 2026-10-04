import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useOnline } from '../hooks/useOnline'
import { QUEUE_CHANGED_EVENT, flushQueue, readQueue } from '../offline/syncQueue'
import Icon from './Icon'
import { t, tn } from '../i18n'

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

  const plural = (n: number) => tn('conn.listings', n)

  if (!online) {
    return (
      <div className="banner banner--warn" role="status">
        <Icon name="offline" />
        {t('conn.offline')}
        {pending > 0 && ` ${t('conn.willPost', { listings: plural(pending) })}`}
      </div>
    )
  }

  if (pending > 0 && !token) {
    return (
      <div className="banner" role="status">
        <Icon name="alert" />
        {t('conn.waiting', { listings: plural(pending) })}
      </div>
    )
  }

  if (justSynced > 0) {
    return (
      <div className="banner banner--ok" role="status">
        <Icon name="check" />
        {t('conn.synced', { listings: plural(justSynced) })}
        <button type="button" className="link-button" onClick={() => setJustSynced(0)}>
          {t('conn.dismiss')}
        </button>
      </div>
    )
  }

  return null
}
