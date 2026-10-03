import { Link } from 'react-router-dom'
import { useCommunities } from '../context/CommunityContext'
import { groupOf } from '../lib/categories'
import { exchangeLabel, type Listing } from '../types'
import DataBudgetImage from './DataBudgetImage'
import Icon from './Icon'

type Props = {
  listing: Listing
  /** Inside a category page or row the category is already stated - don't repeat it. */
  hideCategory?: boolean
  /** Adds an action row (e.g. Edit on your own listings). */
  actions?: React.ReactNode
  /** A short "why this matches" line, e.g. which search term it matched. */
  note?: string
  /** Position in the first-load stagger (CSS computes the delay). */
  index?: number
}

/**
 * Four things only: the photo slot (tap to load), the title, one line of
 * terms, and how far away (distance and town).
 */
export default function RuralMarketCard({ listing, hideCategory, actions, note, index }: Props) {
  const { describeDistance } = useCommunities()
  const distance = describeDistance(listing)
  const group = groupOf(listing)
  const terms = [hideCategory ? null : group.label, listing.price || exchangeLabel(listing.exchange)]
    .filter(Boolean)
    .join(' · ')

  return (
    <article
      className={`card${listing.kind === 'request' ? ' card--wanted' : ''}`}
      data-key={listing.id}
      style={index !== undefined ? ({ '--i': index } as React.CSSProperties) : undefined}
    >
      {listing.image && (
        <DataBudgetImage src={listing.image} alt={listing.title} knownSizeKb={listing.image_size_kb} tileIcon={group.icon} />
      )}
      <h3 className="card__title">
        <Link to={`/listings/${encodeURIComponent(listing.id)}`}>{listing.title}</Link>
      </h3>
      <p className="card__terms">{terms}</p>
      {note && <p className="card__note">{note}</p>}
      <p className="card__distance">
        <Icon name="pin" />
        {distance.text}
        {listing.status !== 'available' && <span className="card__status"> · {listing.status}</span>}
      </p>
      {actions && <div className="card__actions">{actions}</div>}
    </article>
  )
}
