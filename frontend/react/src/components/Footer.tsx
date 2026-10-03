import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="footer">
      <p>
        <strong>Banyan</strong> - share what you have, find what you need.
      </p>
      <nav aria-label="Footer">
        <Link to="/about">About</Link>
        <Link to="/communities">Towns</Link>
        <Link to="/data-saver">Data saver</Link>
      </nav>
    </footer>
  )
}
