import { useCommunities } from '../context/CommunityContext'

/** One line of numbers about the network of towns. */
export default function Stats() {
  const { communities } = useCommunities()
  if (communities.length === 0) return null

  const listings = communities.reduce((sum, c) => sum + c.listings, 0)
  const members = communities.reduce((sum, c) => sum + c.members, 0)

  return (
    <p className="stats">
      <strong>{listings}</strong> things shared by <strong>{members}</strong> neighbours across{' '}
      <strong>{communities.length}</strong> towns.
    </p>
  )
}
