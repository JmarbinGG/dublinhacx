import { Link } from 'react-router-dom'
import { Wordmark } from '../components/Navbar'

/**
 * Marketing splash page - deliberately separate from the app itself (no
 * navbar/footer chrome, see AppLayout). "Get started" goes to /app.
 */
export default function Landing() {
  return (
    <div className="landing">
      <Link to="/app" className="landing-logo" aria-label="byproduct. home">
        <Wordmark />
      </Link>

      <div className="landing-hero">
        <h1>Worth the drive.</h1>
        <p>
          A marketplace for rural communities. Find heirloom seed, heavy equipment, craft skills
          and bulk trade from towns a few miles over - the things your next-door neighbor
          doesn't have.
        </p>
        <Link to="/app" className="primary-button landing-cta">
          Get Started &rarr;
        </Link>
        <Link to="/signin" className="landing-signin">
          Already have an account? Sign in
        </Link>
        <p className="landing-note">Built for 1 GB/month connections: text first, photos only on tap.</p>
      </div>
    </div>
  )
}
