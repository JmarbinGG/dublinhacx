import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { formatKb, useDataBudget } from '../context/DataBudgetContext'
import { applyTheme, readTheme, type ThemeChoice } from '../lib/theme'
import Avatar from './Avatar'
import Icon from './Icon'

const THEMES: { id: ThemeChoice; label: string }[] = [
  { id: 'system', label: 'Auto' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
]

/** Everything that isn't search or Post: profile, towns, data saver (with
 * this month's photo usage), theme, and sign in / out. */
export default function AvatarMenu() {
  const { user, logout } = useAuth()
  const { usedKb, budgetKb } = useDataBudget()
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState<ThemeChoice>(readTheme)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  // Close on outside click and Escape (the top bar remounts it per route).
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const over = usedKb >= budgetKb

  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className="menu__button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={user ? `Account menu for ${user.name}` : 'Menu'}
        onClick={() => setOpen(!open)}
      >
        {user ? <Avatar name={user.name} size="sm" /> : <Icon name="user" />}
      </button>

      {open && (
        <div className="menu__panel" role="menu">
          {user ? (
            <Link role="menuitem" to={`/users/${user.id}`} className="menu__item">
              <strong>{user.name}</strong>
              <span className="menu__sub">Your profile and listings</span>
            </Link>
          ) : (
            <>
              <Link role="menuitem" to="/signin" className="menu__item">
                Sign in
              </Link>
              <Link role="menuitem" to="/signup" className="menu__item">
                Join Banyan
              </Link>
            </>
          )}
          <Link role="menuitem" to="/communities" className="menu__item">
            Towns
          </Link>
          <Link role="menuitem" to="/data-saver" className="menu__item">
            Data saver
            <span className={`menu__sub${over ? ' menu__sub--warn' : ''}`}>
              {over && <Icon name="alert" />}
              Photos {formatKb(usedKb)} of {formatKb(budgetKb)}
              {over ? ' - over budget' : ''}
            </span>
          </Link>
          <Link role="menuitem" to="/about" className="menu__item">
            About
          </Link>

          <div className="menu__theme" role="group" aria-label="Theme">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                className="seg"
                aria-pressed={theme === t.id}
                onClick={() => {
                  setTheme(t.id)
                  applyTheme(t.id)
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {user && (
            <button
              type="button"
              role="menuitem"
              className="menu__item menu__item--plain"
              onClick={() => {
                logout()
                navigate('/app')
              }}
            >
              Sign out
            </button>
          )}
        </div>
      )}
    </div>
  )
}
