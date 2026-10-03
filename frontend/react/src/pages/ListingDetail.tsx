import { Link, useNavigate, useParams } from 'react-router-dom'
import { ErrorState, Loading } from '../components/States'
import { useListing } from '../hooks/useListings'
import type { Listing } from '../types'

/** Columns rendered explicitly below, so they are not repeated as "extra". */
const HANDLED_FIELDS = new Set([
  'id',
  'name',
  'image',
  'email',
  'mailtolink',
  'owner',
  'location',
  'quantity',
  'category',
  'status',
])

/** Any column the backend adds later still shows up, as a plain label/value row. */
function extraFields(listing: Listing) {
  return Object.entries(listing).filter(
    ([key, value]) =>
      !HANDLED_FIELDS.has(key) &&
      value !== null &&
      value !== undefined &&
      value !== '' &&
      typeof value !== 'object',
  )
}

function humanize(key: string) {
  return key.replace(/[_-]/g, ' ').replace(/^./, (c) => c.toUpperCase())
}

export default function ListingDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data: listing, loading, error } = useListing(id)

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

  if (error || !listing) {
    return (
      <section>
        {backButton}
        <ErrorState message={error ?? 'That listing could not be found.'} />
        <Link to="/search">Back to all listings</Link>
      </section>
    )
  }

  // Prefer the backend's prepared mailto link, fall back to the raw email.
  const contactHref =
    listing.mailtolink ?? (listing.email ? `mailto:${listing.email}` : null)

  const rows: [string, string][] = [
    ['Owner', listing.owner],
    ['Location', listing.location],
    ['Category', listing.category],
    ['Status', listing.status],
    ['Quantity', listing.quantity ? String(listing.quantity) : null],
    ['Email', listing.email],
  ]
    .filter((row): row is [string, string] => Boolean(row[1]))
    .concat(extraFields(listing).map(([key, value]) => [humanize(key), String(value)]))

  return (
    <section className="detail">
      {backButton}

      <h1>{listing.name}</h1>

      {listing.image && (
        <img className="detail-image" src={listing.image} alt={listing.name} />
      )}

      <dl className="detail-fields">
        {rows.map(([label, value]) => (
          <div key={label} className="detail-row">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      {contactHref && (
        <a className="primary-button" href={contactHref}>
          Contact owner
        </a>
      )}
    </section>
  )
}
