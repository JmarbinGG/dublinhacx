import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import Avatar from '../components/Avatar'
import ContactLink from '../components/ContactLink'
import DataBudgetImage from '../components/DataBudgetImage'
import MorphIcon from '../components/MorphIcon'
import RuralMarketCard from '../components/RuralMarketCard'
import { Empty, ErrorState, Loading } from '../components/States'
import { useProfile } from '../hooks/useItems'
import { QUEUE_CHANGED_EVENT, discardQueued, readQueue } from '../offline/syncQueue'
import { typeLabel } from '../types'
import { t } from '../i18n'

function useQueue() {
  const [queue, setQueue] = useState(readQueue)
  useEffect(() => {
    const update = () => setQueue(readQueue())
    window.addEventListener(QUEUE_CHANGED_EVENT, update)
    return () => window.removeEventListener(QUEUE_CHANGED_EVENT, update)
  }, [])
  return queue
}

/** /users/:id - photo, name, town, bio, contact and their listings. Your own
 * profile also shows closed listings and anything waiting to post. */
export default function Profile() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const location = useLocation()
  const isMe = user != null && String(user.id) === id
  const queue = useQueue()
  const [closedOpen, setClosedOpen] = useState(false)
  // Refetch when the offline queue drains, so freshly posted listings appear.
  const { data: profile, loading, error, reload } = useProfile(id, isMe, isMe ? queue.length : 0)

  if (loading && !profile) return <Loading label={t('profile.loading')} />
  if (error || !profile) return <ErrorState message={error ?? t('profile.notFound')} onRetry={reload} />

  const open = profile.listings.filter((l) => l.status !== 'closed')
  const closed = profile.listings.filter((l) => l.status === 'closed')

  return (
    <section className="profile">
      <header className="profile__header">
        <div className="profile__photo">
          {profile.photo ? <DataBudgetImage src={profile.photo} alt={profile.name} square /> : <Avatar name={profile.name} size="lg" />}
        </div>
        <div className="profile__info">
          <h1>{profile.name}</h1>
          {profile.community && (
            <p className="profile__town">
              <Link to={`/communities/${encodeURIComponent(profile.community)}`}>{profile.community}</Link>
            </p>
          )}
          {profile.bio && <p className="profile__bio">{profile.bio}</p>}
          <p className="profile__since">{t('profile.memberSince', { date: new Date(profile.created_at).toLocaleDateString() })}</p>
          {isMe ? (
            <div className="profile__actions">
              <Link to="/profile/edit" className="secondary-button">
                {t('profile.editProfile')}
              </Link>
              <Link to="/listings/new" className="primary-button">
                {t('profile.shareSomething')}
              </Link>
            </div>
          ) : profile.contact ? (
            <div className="profile__actions">
              <ContactLink contact={profile.contact} subject="Banyan" />
            </div>
          ) : null}
        </div>
      </header>

      {isMe && (location.state as { queued?: boolean } | null)?.queued && queue.length > 0 && (
        <p className="notice notice--warn">
          {t('profile.offlineSaved')}
        </p>
      )}

      {isMe && queue.length > 0 && (
        <>
          <h2 className="results-title">
            {t('profile.waitingToPost')} <span className="count">{queue.length}</span>
          </h2>
          <ul className="queue-list">
            {queue.map((entry) => (
              <li key={entry.client_id} className="queue-item">
                <span>
                  <strong>{entry.listing.title}</strong> · {typeLabel(entry.listing.type)}
                  {entry.error && <span className="queue-item__error"> - {t('profile.rejected')}: {entry.error}</span>}
                </span>
                <button type="button" className="link-button" onClick={() => discardQueued(entry.client_id)}>
                  {t('profile.discard')}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="results-title">
        {isMe ? t('profile.yourListings') : t('profile.listingsOf', { name: profile.name.split(' ')[0] })}
        <span className="count">{open.length}</span>
      </h2>
      {open.length === 0 ? (
        <Empty message={isMe ? t('profile.nothingShared') : t('profile.nothingListed')} />
      ) : (
        <div className="grid">
          {open.map((listing) => (
            <RuralMarketCard
              key={listing.id}
              listing={listing}
              actions={
                isMe ? (
                  <Link to={`/listings/${listing.id}/edit`} className="secondary-button">
                    {t('profile.edit')}
                  </Link>
                ) : undefined
              }
            />
          ))}
        </div>
      )}

      {isMe && closed.length > 0 && (
        <details className="closed-listings" onToggle={(e) => setClosedOpen((e.currentTarget as HTMLDetailsElement).open)}>
          <summary>
            {t('profile.closed', { count: closed.length })} <MorphIcon name="chevron" on={closedOpen} />
          </summary>
          <div className="grid">
            {closed.map((listing) => (
              <RuralMarketCard
                key={listing.id}
                listing={listing}
                actions={
                  <Link to={`/listings/${listing.id}`} className="secondary-button">
                    {t('profile.manage')}
                  </Link>
                }
              />
            ))}
          </div>
        </details>
      )}
    </section>
  )
}
