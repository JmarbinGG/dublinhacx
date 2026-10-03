import { Link } from 'react-router-dom'
import type { Listing } from '../types'

/** One result card. The whole card links to the detail page. */
export default function ListingCard({ listing }: { listing: Listing }) {
  // Short metadata line under the title - whichever of these the row has.
  const meta = [listing.category, listing.location, listing.owner && `by ${listing.owner}`]
    .filter(Boolean)
    .join(' · ')

  return (
    <Link to={`/listings/${listing.id}`} className="card">
      <div className="card-image">
        {listing.image ? (
          <img src={listing.image} alt="" loading="lazy" />
        ) : (
          <span className="no-image">No image</span>
        )}
      </div>

      <div className="card-body">
        <h3>{listing.name}</h3>
        {meta && <p className="card-meta">{meta}</p>}
        <div className="card-tags">
          {listing.status && <span className="badge">{listing.status}</span>}
          {listing.quantity ? <span className="badge">Qty {listing.quantity}</span> : null}
        </div>
      </div>
    </Link>
  )
}
