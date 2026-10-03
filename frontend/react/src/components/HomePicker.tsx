import { useCommunities } from '../context/CommunityContext'

/** "Your town" select. Distances and the town / other-towns views use it. */
export default function HomePicker({ id = 'home-community' }: { id?: string }) {
  const { communities, home, setHome, loading } = useCommunities()
  // Your town might not have any members listed yet - still show it.
  const names = communities.map((c) => c.name)
  if (home && !names.includes(home)) names.unshift(home)

  return (
    <label className="home-picker" htmlFor={id}>
      <span className="home-picker__label">Your town</span>
      <select
        id={id}
        value={home ?? ''}
        disabled={loading && names.length === 0}
        onChange={(event) => setHome(event.target.value)}
      >
        <option value="" disabled>
          {loading ? 'Loading...' : 'Choose your town'}
        </option>
        {names.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </label>
  )
}
