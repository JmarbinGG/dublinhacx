import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { formatKb, useDataBudget } from '../context/DataBudgetContext'
import { LANGS, type LangId } from '../lib/lang'
import { currentLang, setLanguage } from '../i18n'
import { applyTheme, readTheme, type ThemeChoice } from '../lib/theme'
import Avatar from './Avatar'
import Icon from './Icon'
import MorphIcon from './MorphIcon'
import { t } from '../i18n'

const THEMES: { id: ThemeChoice; label: string }[] = [
  { id: 'system', get label() { return t('menu.themeAuto') } },
  { id: 'light', get label() { return t('menu.themeLight') } },
  { id: 'dark', get label() { return t('menu.themeDark') } },
]

/** Everything that isn't search or Post: profile, towns, data saver (with
 * this month's photo usage), theme, and sign in / out. */
export default function AvatarMenu() {
  const { user, logout } = useAuth()
  const { usedKb, budgetKb } = useDataBudget()
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState<ThemeChoice>(readTheme)
  const [lang, setLang] = useState<LangId>(currentLang)
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
        aria-label={user ? t('menu.accountFor', { name: user.name }) : t('menu.menu')}
        onClick={() => setOpen(!open)}
      >
        {user ? <Avatar name={user.name} size="sm" /> : <MorphIcon name="menuClose" on={open} />}
      </button>

      {open && (
        <div className="menu__panel" role="menu">
          {user ? (
            <Link role="menuitem" to={`/users/${user.id}`} className="menu__item">
              <strong>{user.name}</strong>
              <span className="menu__sub">{t('menu.profile')}</span>
            </Link>
          ) : (
            <>
              <Link role="menuitem" to="/signin" className="menu__item">
                {t('menu.signIn')}
              </Link>
              <Link role="menuitem" to="/signup" className="menu__item">
                {t('menu.join')}
              </Link>
            </>
          )}
          <Link role="menuitem" to="/communities" className="menu__item">
            {t('footer.towns')}
          </Link>
          <Link role="menuitem" to="/data-saver" className="menu__item">
            {t('footer.dataSaver')}
            <span className={`menu__sub${over ? ' menu__sub--warn' : ''}`}>
              {over && <Icon name="alert" />}
              {t(over ? 'menu.photosOver' : 'menu.photos', { used: formatKb(usedKb), budget: formatKb(budgetKb) })}
            </span>
          </Link>
          <Link role="menuitem" to="/about" className="menu__item">
            {t('footer.about')}
          </Link>

          <div className="menu__theme" role="group" aria-label={t('menu.theme')}>
            {/* Sun morphs into moon with the theme. */}
            <MorphIcon
              name="theme"
              on={theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)}
            />
            {THEMES.map((th) => (
              <button
                key={th.id}
                type="button"
                className="seg"
                aria-pressed={theme === th.id}
                onClick={() => {
                  setTheme(th.id)
                  applyTheme(th.id)
                }}
              >
                {th.label}
              </button>
            ))}
          </div>

          <div className="menu__theme" role="group" aria-label={t('menu.language')}>
            {LANGS.map((l) => (
              <button
                key={l.id}
                type="button"
                className="seg"
                lang={l.id}
                aria-pressed={lang === l.id}
                onClick={() => {
                  setLang(l.id)
                  void setLanguage(l.id)
                }}
              >
                {l.native}
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
              {t('menu.signOut')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
