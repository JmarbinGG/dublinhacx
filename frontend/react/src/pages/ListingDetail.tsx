import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteListing, updateListing } from '../api/listings'
import { useAuth } from '../auth/AuthContext'
import Avatar from '../components/Avatar'
import ContactLink from '../components/ContactLink'
import DataBudgetImage from '../components/DataBudgetImage'
import { ErrorState, Loading } from '../components/States'
import { useCommunities } from '../context/CommunityContext'
import { useListing, useProfile } from '../hooks/useItems'
import { timeAgo } from '../lib/geo'
import { STATUSES, exchangeLabel, kindLabel, typeLabel, type ListingStatus } from '../types'

export default function ListingDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { user, token } = useAuth()
  const { describeDistance } = useCommunities()
  const { data: listing, loading, error, cachedAt, reload } = useListing(id)
  // The owner's public contact lives on their profile.
  const owner = useProfile(listing ? String(listing.owner.id) : null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const backButton = (
    <button type="button" className="back" onClick={() => navigate(-1)}>
      &larr; Back
    </button>
  )

  if (loading && !listing) {
    return (
      <section>
        {backButton}
        <Loading label="Loading listing..." />
      </section>
    )
  }

  if (error || !listing) {
    return (
      <section>
        {backButton}
        <ErrorState message={error ?? 'That listing could not be found.'} onRetry={reload} />
        <Link to="/search">Back to everything shared</Link>
      </section>
    )
  }

  const distance = describeDistance(listing)
  const isMine = user?.id === listing.owner.id

  async function setStatus(status: ListingStatus) {
    if (!token || !listing) return
    setBusy(true)
    setActionError(null)
    try {
      await updateListing(listing.id, { status }, token)
      reload()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!token || !listing || !window.confirm(`Delete "${listing.title}"? This can't be undone.`)) return
    setBusy(true)
    try {
      await deleteListing(listing.id, token)
      navigate(`/users/${listing.owner.id}`)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not delete.')
      setBusy(false)
    }
  }

  const rows: [string, string | null | undefined][] = [
    ['Exchange', [exchangeLabel(listing.exchange), listing.price].filter(Boolean).join(' · ')],
    ['Quantity', listing.quantity],
    ['Category', listing.category],
    ['Tags', listing.tags.join(', ')],
    ['Posted', timeAgo(listing.created_at)],
  ]

  return (
    <section className="detail">
      {backButton}

      <p className="eyebrow">
        {typeLabel(listing.type)} · {kindLabel(listing)} · {distance.text}
        {listing.status !== 'available' && ` · ${listing.status}`}
      </p>
      <h1>{listing.title}</h1>
      {listing.description && <p className="detail-desc">{listing.description}</p>}

      {listing.image && (
        <div className="detail-image">
          <DataBudgetImage src={listing.image} alt={listing.title} knownSizeKb={listing.image_size_kb} />
        </div>
      )}

      <dl className="detail-fields">
        {rows
          .filter((row): row is [string, string] => Boolean(row[1]))
          .map(([label, value]) => (
            <div key={label} className="detail-row">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>

      <Link to={`/users/${listing.owner.id}`} className="owner-row">
        <Avatar name={listing.owner.name} />
        <span>
          <strong>{listing.owner.name}</strong>
          {listing.owner.community && <span className="owner-row__town">{listing.owner.community}</span>}
        </span>
        <span className="owner-row__more">Profile</span>
      </Link>

      {isMine ? (
        <div className="owner-tools">
          <Link to={`/listings/${listing.id}/edit`} className="secondary-button">
            Edit
          </Link>
          <label className="field">
            <span>Status</span>
            <select value={listing.status} disabled={busy} onChange={(e) => setStatus(e.target.value as ListingStatus)}>
              {STATUSES.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="secondary-button danger-button" disabled={busy} onClick={remove}>
            Delete
          </button>
          {actionError && (
            <p className="form-error" role="alert">
              {actionError}
            </p>
          )}
        </div>
      ) : (
        <div id="connect" className="connect-box">
          {cachedAt ? (
            <p>You're offline - contact details will show when you reconnect.</p>
          ) : owner.loading ? (
            <p>Loading contact...</p>
          ) : owner.data?.contact ? (
            <>
              <p>
                {listing.kind === 'request'
                  ? `Can you help ${listing.owner.name}? Get in touch:`
                  : `Ask ${listing.owner.name} about it, or offer a trade:`}
              </p>
              <ContactLink contact={owner.data.contact} subject={`Banyan: ${listing.title}`} />
            </>
          ) : (
            <p>
              {listing.owner.name} hasn't shared contact details yet.{' '}
              <Link to={`/users/${listing.owner.id}`}>See their profile</Link>.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
