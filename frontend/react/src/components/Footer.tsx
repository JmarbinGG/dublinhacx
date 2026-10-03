import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div>
          <strong>Banyan</strong>
          <p>Share what you have. Find what you need.</p>
        </div>

        <nav className="footer-links" aria-label="Footer">
          <Link to="/about">About</Link>
          <Link to="/data-saver">Data saver</Link>
          <Link to="/communities">Towns</Link>
        </nav>
      </div>
    </footer>
  )
}
