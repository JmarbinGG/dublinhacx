import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import DataMeter from './DataMeter'

/** Inline banyan mark + name - a few hundred bytes, no image download. */
export function Wordmark() {
  return (
    <span className="wordmark">
      <svg className="wordmark__tree" viewBox="0 0 32 32" aria-hidden="true">
        <path
          d="M16 3c-6 0-11 3.6-11 8.2 0 3.3 2.6 5.4 6 6.3V28h2.4v-8.5h1.4V28h2.4v-8.5h1.4V28H21V17.5c3.4-.9 6-3 6-6.3C27 6.6 22 3 16 3z"
          fill="currentColor"
        />
      </svg>
      Banyan
    </span>
  )
}

/** Top navigation. Shows Sign In / Sign Up, or the signed-in user. */
export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleSignOut() {
    logout()
    navigate('/app')
  }

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/app" className="logo" aria-label="Banyan home">
          <Wordmark />
        </Link>

        <nav className="nav-links" aria-label="Main">
          <NavLink to="/search">Browse</NavLink>
          <NavLink to="/communities">Towns</NavLink>
          <DataMeter />
          {user ? (
            <>
              <NavLink to={`/users/${user.id}`}>My profile</NavLink>
              <Link to="/listings/new" className="primary-button">
                + Share
              </Link>
              <button type="button" className="link-button" onClick={handleSignOut}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <NavLink to="/signin">Sign in</NavLink>
              <Link to="/signup" className="primary-button">
                Join
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
