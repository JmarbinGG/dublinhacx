import { Link } from 'react-router-dom'
import { useCommunities } from '../context/CommunityContext'
import { exchangeLabel, typeLabel, type Listing } from '../types'
import DataBudgetImage from './DataBudgetImage'
import Icon from './Icon'

type Props = {
  listing: Listing
  /** Replaces nothing on the card - adds an action row (e.g. Edit on your own listings). */
  actions?: React.ReactNode
  /** A short "why this matches" line, e.g. from the AI overview. */
  note?: string
  /** Position in a staggered entrance (CSS computes the delay). */
  index?: number
}

/**
 * Four things only: the (opt-in) photo, the title, one line of terms, and
 * how far away it is. Everything else is on the listing page.
 */
export default function RuralMarketCard({ listing, actions, note, index }: Props) {
  const { describeDistance } = useCommunities()
  const distance = describeDistance(listing)
  const wanted = listing.kind === 'request'
  // One line: what kind of thing, and on what terms.
  const terms = [
    wanted ? (listing.type === 'skill' ? 'Help wanted' : 'Wanted') : typeLabel(listing.type),
    listing.price || exchangeLabel(listing.exchange),
  ].join(' · ')

  return (
    <article
      className={`card${wanted ? ' card--wanted' : ''}`}
      style={index !== undefined ? ({ '--i': index } as React.CSSProperties) : undefined}
    >
      {listing.image && <DataBudgetImage src={listing.image} alt={listing.title} knownSizeKb={listing.image_size_kb} />}
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
