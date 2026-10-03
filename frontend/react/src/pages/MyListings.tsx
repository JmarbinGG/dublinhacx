import { useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteListing } from '../api/listings'
import { useAuth } from '../auth/AuthContext'
import { Empty, ErrorState, Loading } from '../components/States'
import { useMyListings } from '../hooks/useListings'
import type { Listing } from '../types'

/** /my-listings - what the signed-in user has posted, with delete. */
export default function MyListings() {
  const { user, token } = useAuth()
  const { data, loading, error } = useMyListings(token)
  const [listings, setListings] = useState<Listing[] | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | number | null>(null)

  // Local copy so a delete can remove a row immediately without refetching -
  // resynced whenever a fresh fetch comes in.
  const visible = listings ?? data

  async function handleDelete(id: string | number) {
    if (!token) return
    if (!window.confirm('Delete this listing? This cannot be undone.')) return

    setDeleteError(null)
    setDeletingId(id)
    try {
      await deleteListing(id, token)
      setListings((visible ?? []).filter((listing) => listing.id !== id))
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
      <h2 className="results-heading">
        My Listings
        {!loading && !error && visible && <span className="count">{visible.length}</span>}
      </h2>

      {loading && <Loading label="Loading your listings..." />}
      {!loading && error && <ErrorState message={error} onRetry={() => window.location.reload()} />}
      {deleteError && (
        <p className="photo-status photo-status--error" role="alert">
          {deleteError}
        </p>
      )}
      {!loading && !error && (!visible || visible.length === 0) && (
        <Empty message="You haven't posted anything yet." />
      )}

      {!loading && !error && visible && visible.length > 0 && (
        <div className="grid">
          {visible.map((listing) => (
            <div key={String(listing.id)} className="card my-listing-card">
              <Link to={`/listings/${listing.id}`} className="my-listing-card__link">
                <div className="card-image">
                  {listing.image ? (
                    <img src={listing.image} alt="" loading="lazy" />
                  ) : (
                    <span className="no-image">No image</span>
                  )}
                </div>
                <div className="card-body">
                  <h3>{listing.name}</h3>
                  {listing.category && <p className="card-meta">{listing.category}</p>}
                </div>
              </Link>
              <button
                type="button"
                className="secondary-button my-listing-card__delete"
                disabled={deletingId === listing.id}
                onClick={() => handleDelete(listing.id)}
              >
                {deletingId === listing.id ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
