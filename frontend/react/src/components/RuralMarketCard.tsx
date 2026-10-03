import { Link } from 'react-router-dom'
import { useCommunities } from '../context/CommunityContext'
import { timeAgo } from '../lib/geo'
import { categoryLabel, type Item } from '../types'
import DataBudgetImage from './DataBudgetImage'

type Props = {
  item: Item
  /** Replaces the default "Connect / Offer" footer action (e.g. Delete on My Listings). */
  actions?: React.ReactNode
}

/**
 * Text-first listing card: category + distance badges, title, short
 * description, price/trade terms, an opt-in photo, and a Connect action.
 * Everything except the photo arrives in the initial JSON.
 */
export default function RuralMarketCard({ item, actions }: Props) {
  const { describeDistance } = useCommunities()
  const distance = describeDistance(item.community_id)

  return (
    <article className="market-card">
      <div className="market-card__badges">
        <span className={`badge badge--${item.category}`}>{categoryLabel(item.category)}</span>
        <span className={`distance-badge distance-badge--${distance.tone}`}>{distance.text}</span>
      </div>

      <h3 className="market-card__title">
        <Link to={`/listings/${item.id}`}>{item.title}</Link>
      </h3>

      {item.description && <p className="market-card__desc">{item.description}</p>}

      {(item.price_or_exchange || item.quantity) && (
        <p className="market-card__price">
          {item.price_or_exchange}
          {item.price_or_exchange && item.quantity && ' · '}
          {item.quantity && <span className="market-card__qty">{item.quantity}</span>}
        </p>
      )}

      {item.image_url && (
        <DataBudgetImage src={item.image_url} sizeKb={item.image_size_kb} alt={item.title} />
      )}

      <footer className="market-card__footer">
        <span className="market-card__meta">
          {[item.owner, timeAgo(item.created_at)].filter(Boolean).join(' · ')}
        </span>
        {actions ?? (
          <Link to={`/listings/${item.id}#connect`} className="primary-button market-card__cta">
            Connect / Offer
          </Link>
        )}
      </footer>
    </article>
  )
}
