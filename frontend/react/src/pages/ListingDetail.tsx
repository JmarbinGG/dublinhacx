import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import DataBudgetImage from '../components/DataBudgetImage'
import { ErrorState, Loading } from '../components/States'
import { useCommunities } from '../context/CommunityContext'
import { useItem } from '../hooks/useItems'
import { timeAgo } from '../lib/geo'
import { categoryLabel } from '../types'

export default function ListingDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { user, token } = useAuth()
  const { describeDistance } = useCommunities()
  const { data: item, loading, error, cachedAt } = useItem(id, token)

  const backButton = (
    <button type="button" className="back" onClick={() => navigate(-1)}>
      &larr; Back
    </button>
  )

  if (loading) {
    return (
      <section>
        {backButton}
        <Loading label="Loading listing..." />
      </section>
    )
  }

  if (error || !item) {
    return (
      <section>
        {backButton}
        <ErrorState message={error ?? 'That listing could not be found.'} />
        <Link to="/search">Back to all listings</Link>
      </section>
    )
  }

  const distance = describeDistance(item.community_id)
  const isMine = user != null && item.owner_id === user.id
  // Built here from the email alone (never a stored link), so the href can
  // only ever be a mailto:.
  const mailto = item.contact_email
    ? `mailto:${encodeURIComponent(item.contact_email)}?subject=${encodeURIComponent(`byproduct.: ${item.title}`)}`
    : null

  const rows: [string, string | null | undefined][] = [
    ['Price / exchange', item.price_or_exchange],
    ['Quantity', item.quantity],
    ['Posted by', item.owner],
    ['Posted', timeAgo(item.created_at)],
    ['Tags', item.tags?.split(',').join(', ')],
  ]

  return (
    <section className="detail">
      {backButton}

      <div className="market-card__badges">
        <span className={`badge badge--${item.category}`}>{categoryLabel(item.category)}</span>
        <span className={`distance-badge distance-badge--${distance.tone}`}>{distance.text}</span>
      </div>
      <h1>{item.title}</h1>
      {item.description && <p className="detail-desc">{item.description}</p>}

      {item.image_url && (
        <div className="detail-image">
          <DataBudgetImage src={item.image_url} sizeKb={item.image_size_kb} alt={item.title} />
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

      <div id="connect" className="connect-box">
        {isMine ? (
          <p>This is your listing.</p>
        ) : !user ? (
          <>
            <p>Sign in to see contact details and make an offer.</p>
            <Link to="/signin" className="primary-button">
              Sign in to connect
            </Link>
          </>
        ) : cachedAt ? (
          <p>You're offline - contact details will show when you reconnect.</p>
        ) : mailto ? (
          <>
            <p>
              Reach out to {item.owner ?? 'the owner'} to ask a question, offer cash or propose a
              trade.
            </p>
            <a className="primary-button" href={mailto}>
              Connect / Offer
            </a>
            <p className="connect-box__email">{item.contact_email}</p>
          </>
        ) : (
          <p>The owner didn't leave contact details.</p>
        )}
      </div>
    </section>
  )
}
