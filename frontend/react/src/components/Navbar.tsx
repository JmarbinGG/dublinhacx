import { Link, useNavigate } from 'react-router-dom'
import logo from '../assets/logo.png'
import { useAuth } from '../auth/AuthContext'

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
        <Link to="/app" className="logo">
          <img src={logo} alt="byproduct." className="logo-mark" />
          <span className="logo-period">.</span>
        </Link>

        <nav className="nav-links">
          <Link to="/categories">Categories</Link>
          <Link to="/about">About Us</Link>
          {user ? (
            <>
              {/* Same slots Sign In / Sign Up occupy when signed out - a
                  plain link, then the primary-button action. */}
              <Link to="/my-listings">My Listings</Link>
              <Link to="/listings/new" className="primary-button">
                + New Listing
              </Link>
              <span className="nav-greeting">Hi, {user.name}</span>
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
