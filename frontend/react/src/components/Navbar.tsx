import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import DataMeter from './DataMeter'

/** Text wordmark rather than the old 62 KB logo image - zero extra bytes. */
export function Wordmark() {
  return (
    <span className="wordmark">
      byproduct<span className="wordmark__dot">.</span>
    </span>
  )
}

/** Top navigation. Shows Sign In / Sign Up, or the signed-in user, once known. */
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
        <Link to="/app" className="logo" aria-label="byproduct. home">
          <Wordmark />
        </Link>

        <nav className="nav-links">
          <Link to="/search">Browse</Link>
          <Link to="/categories">Categories</Link>
          <DataMeter />
          {user ? (
            <>
              <Link to="/my-listings">My Listings</Link>
              <Link to="/listings/new" className="primary-button">
                + New Listing
              </Link>
              <button type="button" className="link-button" onClick={handleSignOut}>
                Sign Out
              </button>
            </>
          ) : (
            <>
              <Link to="/signin">Sign In</Link>
              <Link to="/signup" className="primary-button">
                Sign Up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
