import { Link, useParams } from 'react-router-dom'
import Avatar from '../components/Avatar'
import ItemGrid from '../components/ItemGrid'
import { useCommunities } from '../context/CommunityContext'
import { useListings, useUsers } from '../hooks/useItems'

/** /communities/:name - who lives there and what they're sharing. */
export default function CommunityPage() {
  const { name = '' } = useParams()
  const { home, setHome } = useCommunities()
  const listings = useListings({ community: name, limit: 48 })
  const people = useUsers({ community: name, limit: 50 })

  return (
    <section className="feed">
      <Link to="/communities" className="back">
        &larr; All towns
      </Link>
      <div className="section-heading">
        <h1>{name}</h1>
        {home !== name && (
          <button type="button" className="secondary-button" onClick={() => setHome(name)}>
            This is my town
          </button>
        )}
      </div>

      {people.data && people.data.length > 0 && (
        <div className="people-strip" aria-label="People">
          {people.data.map((person) => (
            <Link key={person.id} to={`/users/${person.id}`} className="person-chip">
              <Avatar name={person.name} size="sm" />
              <span>
                <strong>{person.name}</strong>
              </span>
            </Link>
          ))}
        </div>
      )}

      <h2 className="results-heading">
        Shared in {name}
        {listings.data && <span className="count">{listings.data.length}</span>}
      </h2>
      <ItemGrid
        listings={listings.data}
        loading={listings.loading}
        error={listings.error}
        emptyMessage={`Nothing shared in ${name} yet.`}
        onRetry={listings.reload}
      />
    </section>
  )
}
