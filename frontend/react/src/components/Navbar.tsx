import { Link, useLocation } from 'react-router-dom'
import AvatarMenu from './AvatarMenu'
import Icon from './Icon'
import SearchBar from './SearchBar'
import { t } from '../i18n'

/**
 * Banyan mark: a canopy, a trunk and four aerial roots, hand-drawn as SVG
 * strokes (well under 1 KB). `pathLength=1` lets CSS draw it on with
 * stroke-dashoffset on the landing page - no measuring needed.
 */
export function Logo({ draw = false }: { draw?: boolean }) {
  return (
    <svg className={`logo-mark${draw ? ' logo-mark--draw' : ''}`} viewBox="0 0 32 32" aria-hidden="true">
      <path pathLength={1} d="M3.5 13C4 7 9.5 3.5 16 3.5S28 7 28.5 13" />
      <path pathLength={1} d="M3.5 13h25" />
      <path pathLength={1} d="M16 13v15.5" />
      <path pathLength={1} d="M8.5 13c.6 5 .2 10.5 0 15.5M23.5 13c-.6 5-.2 10.5 0 15.5" />
      <path pathLength={1} d="M12 13v8M20 13v9" />
      <path pathLength={1} d="M5 28.5h22" />
    </svg>
  )
}

export function Wordmark({ draw = false }: { draw?: boolean }) {
  return (
    <span className="wordmark">
      <Logo draw={draw} />
      Banyan
    </span>
  )
}

/** Top bar: logo, search (with inline Ask AI), Post, and the avatar menu. */
export default function Navbar() {
  const { pathname, search } = useLocation()
  // Home has its own large search box; don't show two.
  const showSearch = pathname !== '/app'
  const query = pathname === '/search' ? (new URLSearchParams(search).get('q') ?? '') : ''

  return (
    <header className="topbar">
      <div className="topbar__inner">
        <Link to="/app" className="topbar__logo" aria-label={t('common.homeLabel')}>
          <Wordmark />
        </Link>
        {showSearch && (
          <div className="topbar__search">
            <SearchBar key={query} initialQuery={query} />
          </div>
        )}
        <Link to="/listings/new" className="primary-button topbar__post" aria-label={t('nav.postLabel')}>
          <Icon name="plus" />
          <span>{t('nav.post')}</span>
        </Link>
        <AvatarMenu key={pathname} />
      </div>
    </header>
  )
}
