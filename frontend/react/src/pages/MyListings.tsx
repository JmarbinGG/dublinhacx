import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { deleteItem } from '../api/items'
import { useAuth } from '../auth/AuthContext'
import RuralMarketCard from '../components/RuralMarketCard'
import { Empty, ErrorState, Loading } from '../components/States'
import { useMyItems } from '../hooks/useItems'
import { QUEUE_CHANGED_EVENT, discardQueued, readQueue } from '../offline/syncQueue'
import { categoryLabel, type Item } from '../types'

function useQueue() {
  const [queue, setQueue] = useState(() => readQueue())
  useEffect(() => {
    const update = () => setQueue(readQueue())
    window.addEventListener(QUEUE_CHANGED_EVENT, update)
    return () => window.removeEventListener(QUEUE_CHANGED_EVENT, update)
  }, [])
  return queue
}

/** /my-listings - what the signed-in user has posted, plus anything still
 * waiting to sync from offline. */
export default function MyListings() {
  const { user, token } = useAuth()
  const queue = useQueue()
  const location = useLocation()
  // Refetch whenever the queue changes, so freshly synced listings appear.
  const { data, loading, error } = useMyItems(token, queue.length)
  const [deleted, setDeleted] = useState<Set<string>>(() => new Set())
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const visible = (data ?? []).filter((item) => !deleted.has(item.id))

  async function handleDelete(item: Item) {
    if (!token) return
    if (!window.confirm(`Delete "${item.title}"? This cannot be undone.`)) return

    setDeleteError(null)
    setDeletingId(item.id)
    try {
      await deleteItem(item.id, token)
      setDeleted(new Set(deleted).add(item.id))
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete this listing.')
    } finally {
      setDeletingId(null)
    }
  }

  if (!user) {
    return (
      <section>
        <h2 className="results-heading">My Listings</h2>
        <div className="state">
          <p>Sign in to see what you've posted.</p>
          <Link to="/signin" className="primary-button">
            Sign In
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section>
      {(location.state as { queued?: boolean } | null)?.queued && queue.length > 0 && (
        <p className="cached-note">
          You're offline, so your listing was saved on this device. It will post automatically
          when you reconnect.
        </p>
      )}

      {queue.length > 0 && (
        <>
          <h2 className="results-heading">
            Waiting to sync <span className="count">{queue.length}</span>
          </h2>
          <ul className="queue-list">
            {queue.map((entry) => (
              <li key={entry.client_id} className="queue-item">
                <span>
                  <strong>{entry.item.title}</strong> · {categoryLabel(entry.item.category)}
                  {entry.error && <span className="queue-item__error"> - rejected: {entry.error}</span>}
                </span>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => discardQueued(entry.client_id)}
                >
                  Discard
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="results-heading">
        My Listings
        {!loading && !error && <span className="count">{visible.length}</span>}
      </h2>

      {loading && <Loading label="Loading your listings..." />}
      {!loading && error && <ErrorState message={error} onRetry={() => window.location.reload()} />}
      {deleteError && (
        <p className="photo-status photo-status--error" role="alert">
          {deleteError}
        </p>
      )}
      {!loading && !error && visible.length === 0 && <Empty message="You haven't posted anything yet." />}

      {!loading && !error && visible.length > 0 && (
        <div className="grid">
          {visible.map((item) => (
            <RuralMarketCard
              key={item.id}
              item={item}
              actions={
                <button
                  type="button"
                  className="secondary-button danger-button"
                  disabled={deletingId === item.id}
                  onClick={() => handleDelete(item)}
                >
                  {deletingId === item.id ? 'Deleting...' : 'Delete'}
                </button>
              }
            />
          ))}
        </div>
      )}
    </section>
  )
}
