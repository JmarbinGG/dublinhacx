import { Link } from 'react-router-dom'

/**
 * Site-wide footer. Contact address is a placeholder - swap it for the real
 * one when there is one.
 */
export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div>
          <strong>byproduct.</strong>
          <p>Specialized trade between rural communities, built for slow connections.</p>
        </div>

        <nav className="footer-links">
          <Link to="/about">About Us</Link>
          <Link to="/data-saver">Data Saver</Link>
          <a href="mailto:hello@byproduct.app">Contact</a>
        </nav>
      </div>

      <p className="footer-copy">Built at IslandHacks 2026.</p>
    </footer>
  )
}
