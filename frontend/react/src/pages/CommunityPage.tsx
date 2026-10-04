import { Link, useParams } from 'react-router-dom'
import Avatar from '../components/Avatar'
import ItemGrid from '../components/ItemGrid'
import { useCommunities } from '../context/CommunityContext'
import { useListings, useUsers } from '../hooks/useItems'
import { t } from '../i18n'

/** /communities/:name - who lives there and what they're sharing. */
export default function CommunityPage() {
  const { name = '' } = useParams()
  const { home, setHome } = useCommunities()
  const listings = useListings({ community: name, limit: 48 })
  const people = useUsers({ community: name, limit: 50 })

  return (
    <section className="stack">
      <Link to="/communities" className="back">
        &larr; {t('towns.all')}
      </Link>
      <div className="section-head">
        <h1>{name}</h1>
        {home !== name && (
          <button type="button" className="secondary-button" onClick={() => setHome(name)}>
            {t('towns.mine')}
          </button>
        )}
      </div>

      {people.data && people.data.length > 0 && (
        <div className="people" aria-label={t('towns.people')}>
          {people.data.map((person) => (
            <Link key={person.id} to={`/users/${person.id}`} className="person">
              <Avatar name={person.name} size="sm" />
              <span>
                <strong>{person.name}</strong>
              </span>
            </Link>
          ))}
        </div>
      )}

      <h2 className="results-title">
        {t('towns.sharedIn', { name })}
        {listings.data && <span className="count">{listings.data.length}</span>}
      </h2>
      <ItemGrid
        listings={listings.data}
        loading={listings.loading}
        error={listings.error}
        emptyMessage={t('towns.empty', { name })}
        onRetry={listings.reload}
      />
    </section>
  )
}
