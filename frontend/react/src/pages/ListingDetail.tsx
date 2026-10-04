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
import { topicLabel } from '../lib/categories'
import { timeAgo } from '../lib/geo'
import { STATUSES, exchangeLabel, kindLabel, typeLabel, type ListingStatus } from '../types'
import { t } from '../i18n'

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
      &larr; {t('listingDetail.back')}
    </button>
  )

  if (loading && !listing) {
    return (
      <section>
        {backButton}
        <Loading label={t('listingDetail.loadingListing')} />
      </section>
    )
  }

  if (error || !listing) {
    return (
      <section>
        {backButton}
        <ErrorState message={error ?? t('listingDetail.notFound')} onRetry={reload} />
        <Link to="/search">{t('listingDetail.backToAllShared')}</Link>
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
      setActionError(err instanceof Error ? err.message : t('listingDetail.couldNotUpdate'))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!token || !listing || !window.confirm(t('listingDetail.deleteConfirm', { title: listing.title }))) return
    setBusy(true)
    try {
      await deleteListing(listing.id, token)
      navigate(`/users/${listing.owner.id}`)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('listingDetail.couldNotDelete'))
      setBusy(false)
    }
  }

  const rows: [string, string | null | undefined][] = [
    [t('listingDetail.exchange'), [exchangeLabel(listing.exchange), listing.price].filter(Boolean).join(' · ')],
    [t('listingDetail.quantity'), listing.quantity],
    [t('listingDetail.category'), listing.category ? topicLabel(listing.category) : null],
    [t('listingDetail.tags'), listing.tags.join(', ')],
    [t('listingDetail.posted'), timeAgo(listing.created_at)],
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
        <span className="owner-row__more">{t('listingDetail.profile')}</span>
      </Link>

      {isMine ? (
        <div className="owner-tools">
          <Link to={`/listings/${listing.id}/edit`} className="secondary-button">
            {t('listingDetail.edit')}
          </Link>
          <label className="field">
            <span>{t('listingDetail.status')}</span>
            <select value={listing.status} disabled={busy} onChange={(e) => setStatus(e.target.value as ListingStatus)}>
              {STATUSES.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="secondary-button danger-button" disabled={busy} onClick={remove}>
            {t('listingDetail.delete')}
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
            <p>{t('listingDetail.offlineContact')}</p>
          ) : owner.loading ? (
            <p>{t('listingDetail.loadingContact')}</p>
          ) : owner.data?.contact ? (
            <>
              <p>
                {listing.kind === 'request'
                  ? t('listingDetail.canYouHelp', { name: listing.owner.name })
                  : t('listingDetail.askOwner', { name: listing.owner.name })}
              </p>
              <ContactLink contact={owner.data.contact} subject={`Banyan: ${listing.title}`} />
            </>
          ) : (
            <p>
              {t('listingDetail.noContact', { name: listing.owner.name })}{' '}
              <Link to={`/users/${listing.owner.id}`}>{t('listingDetail.seeProfile')}</Link>.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
