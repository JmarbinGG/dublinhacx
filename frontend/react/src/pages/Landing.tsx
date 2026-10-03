import { Link } from 'react-router-dom'
import { Wordmark } from '../components/Navbar'
import { ROOTS } from '../generated/art'

/** Splash page - separate from the app (no top bar, footer or assistant). */
export default function Landing() {
  return (
    <div className="landing">
      <header className="landing__top">
        <Link to="/app" aria-label="Banyan home">
          <Wordmark draw />
        </Link>
        <Link to="/signin">Sign in</Link>
      </header>

      <main className="landing__body">
        <h1>Share what you have. Find what you need.</h1>
        <p>
          A pump set sitting idle, a roll of drip pipe left over, someone who can fix a tractor or stitch a blouse.
          Banyan helps them reach the neighbour, or the next town over, that needs them.
        </p>
        <div className="landing__actions">
          <Link to="/app" className="primary-button">
            See what's shared nearby
          </Link>
          <Link to="/signup" className="secondary-button">
            Join
          </Link>
        </div>
        <p className="hint">Made for slow connections: text first, photos only when you tap.</p>
      </main>

      {/* The banyan's aerial roots: a parametric curve family computed at
          build time (scripts/design.mjs) - one static path, under 1 KB. */}
      <svg className="landing__roots" viewBox={`0 -8 ${ROOTS.width} ${ROOTS.height + 8}`} aria-hidden="true" preserveAspectRatio="none">
        <path d={ROOTS.d} />
      </svg>
    </div>
  )
}
