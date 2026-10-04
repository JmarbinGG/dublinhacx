import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Summary } from '../api/summary'
import { GROUPS } from '../lib/categories'
import { motionAllowed } from '../lib/motion'
import { openFromTile } from '../lib/viewTransition'
import Icon from './Icon'
import { t } from '../i18n'

// The tiles' entrance plays once per visit, on first load only.
let entered = false

/** Four category tiles - two by two on a phone - each with icon, name and count. */
export default function CategoryTiles({ summary }: { summary: Summary | null }) {
  const navigate = useNavigate()
  const [enter] = useState(() => {
    const first = !entered && motionAllowed()
    entered = true
    return first
  })

  return (
    <nav className={`tiles${enter ? ' tiles--enter' : ''}`} aria-label={t('home.categories')}>
      {GROUPS.map((group, i) => {
        const href = `/app/c/${group.id}`
        const count = summary?.[group.id]?.count
        return (
          <Link
            key={group.id}
            to={href}
            className="tile"
            style={{ '--i': i } as React.CSSProperties}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
              e.preventDefault()
              openFromTile(e.currentTarget, () => navigate(href))
            }}
          >
            <Icon name={group.icon} />
            <span className="tile__name">{group.label}</span>
            <span className="tile__count">{count ?? ''}</span>
          </Link>
        )
      })}
    </nav>
  )
}
