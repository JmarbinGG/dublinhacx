import { useCommunities } from '../context/CommunityContext'
import { t } from '../i18n'

/** One line of numbers about the network of towns. */
export default function Stats() {
  const { communities } = useCommunities()
  if (communities.length === 0) return null

  const listings = communities.reduce((sum, c) => sum + c.listings, 0)
  const members = communities.reduce((sum, c) => sum + c.members, 0)

  return (
    <p className="stats">
      <strong>{listings}</strong> {t('stats.thingsSharedBy', { listings, members, towns: communities.length })} <strong>{members}</strong> {t('stats.neighboursAcross')} <strong>{communities.length}</strong> {t('stats.towns')}.
    </p>
  )
}
