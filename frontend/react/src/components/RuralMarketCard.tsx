import { Link } from 'react-router-dom'
import { useCommunities } from '../context/CommunityContext'
import { timeAgo } from '../lib/geo'
import { exchangeLabel, kindLabel, typeLabel, type Listing } from '../types'
import Avatar from './Avatar'
import DataBudgetImage from './DataBudgetImage'

type Props = {
  listing: Listing
  /** Replaces the default "Connect" footer action (e.g. Edit on your own listings). */
  actions?: React.ReactNode
  /** A short "why this matches" line, e.g. from the AI overview. */
  note?: string
}

/**
 * Text-first listing card: type, offer/wanted and distance badges, title,
 * short description, exchange terms, an opt-in photo, and who posted it.
 * Everything except the photo arrives in the initial JSON.
 */
export default function RuralMarketCard({ listing, actions, note }: Props) {
  const { describeDistance } = useCommunities()
  const distance = describeDistance(listing)
  const terms = [exchangeLabel(listing.exchange), listing.price, listing.quantity].filter(Boolean).join(' · ')

  return (
    <article className={`market-card${listing.kind === 'request' ? ' market-card--request' : ''}`}>
      <div className="market-card__badges">
        <span className={`badge badge--${listing.type}`}>{typeLabel(listing.type)}</span>
        <span className={`badge badge--kind-${listing.kind}`}>{kindLabel(listing)}</span>
        <span className={`distance-badge distance-badge--${distance.tone}`}>{distance.text}</span>
        {listing.status !== 'available' && <span className="badge badge--status">{listing.status}</span>}
      </div>

      <h3 className="market-card__title">
        <Link to={`/listings/${encodeURIComponent(listing.id)}`}>{listing.title}</Link>
      </h3>

      {note && <p className="market-card__note">{note}</p>}
      {listing.description && <p className="market-card__desc">{listing.description}</p>}
      {terms && <p className="market-card__price">{terms}</p>}

      {listing.image && <DataBudgetImage src={listing.image} alt={listing.title} />}

      <footer className="market-card__footer">
        <Link to={`/users/${listing.owner.id}`} className="market-card__owner">
          <Avatar name={listing.owner.name} size="sm" />
          <span>
            {listing.owner.name}
            <span className="market-card__meta"> · {timeAgo(listing.created_at)}</span>
          </span>
        </Link>
        {actions ?? (
          <Link to={`/listings/${encodeURIComponent(listing.id)}#connect`} className="primary-button market-card__cta">
            {listing.kind === 'request' ? 'I can help' : 'Connect'}
          </Link>
        )}
      </footer>
    </article>
  )
}
