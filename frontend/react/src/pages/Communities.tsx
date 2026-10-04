import { Link } from 'react-router-dom'
import HomePicker from '../components/HomePicker'
import Stats from '../components/Stats'
import { Loading } from '../components/States'
import { useCommunities } from '../context/CommunityContext'
import { distanceKm } from '../lib/geo'
import { formatNumber, t, tn } from '../i18n'

/** /communities - every town on Banyan, with members and open listings. */
export default function Communities() {
  const { communities, loading, home, homePoint, pointOf } = useCommunities()

  if (loading && communities.length === 0) return <Loading label={t('towns.loading')} />

  const rows = communities.map((c) => {
    const point = pointOf(c.name)
    return { ...c, km: homePoint && point && c.name !== home ? distanceKm(homePoint, point) : null }
  })

  return (
    <section className="stack">
      <h1>{t('footer.towns')}</h1>
      <Stats />
      <HomePicker id="towns-home" />
      <ul className="town-list">
        {rows.map((c) => (
          <li key={c.name}>
            <Link to={`/communities/${encodeURIComponent(c.name)}`} className="town">
              <span className="town__name">
                {c.name}
                {c.name === home && <span className="tag">{t('town.yours')}</span>}
              </span>
              <span className="town__meta">
                {t('towns.open', { n: formatNumber(c.listings) })} · {tn('towns.neighbours', c.members)}
                {c.km != null && ` · ${t('towns.km', { km: formatNumber(Math.round(c.km)) })}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
