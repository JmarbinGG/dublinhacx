import { useCommunities } from '../context/CommunityContext'

/** "Your community" select. Distances everywhere are measured from it. */
export default function HomePicker({ id = 'home-community' }: { id?: string }) {
  const { communities, home, setHomeId, loading } = useCommunities()

  return (
    <label className="home-picker" htmlFor={id}>
      <span className="home-picker__label">Your community</span>
      <select
        id={id}
        value={home?.id ?? ''}
        disabled={loading || communities.length === 0}
        onChange={(event) => setHomeId(event.target.value)}
      >
        <option value="" disabled>
          {loading ? 'Loading...' : 'Choose where you are'}
        </option>
        {communities.map((community) => (
          <option key={community.id} value={community.id}>
            {community.name}
          </option>
        ))}
      </select>
    </label>
  )
}
