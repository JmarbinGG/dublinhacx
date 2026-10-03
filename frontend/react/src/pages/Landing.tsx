import { Link } from 'react-router-dom'
import { Wordmark } from '../components/Navbar'

/** Marketing splash page - separate from the app (no navbar/footer/chat). */
export default function Landing() {
  return (
    <div className="landing">
      <Link to="/app" className="landing-logo" aria-label="Banyan home">
        <Wordmark />
      </Link>

      <div className="landing-hero">
        <h1>Share what you have. Find what you need.</h1>
        <p>
          The banyan is where the village meets - and its branches drop roots that grow into new trunks. Banyan
          connects neighbours and nearby towns to share spare materials, idle equipment, and the skills to get work
          done.
        </p>
        <Link to="/app" className="primary-button landing-cta">
          Get started &rarr;
        </Link>
        <Link to="/signin" className="landing-signin">
          Already a member? Sign in
        </Link>
        <p className="landing-note">Made for slow, capped connections: text first, photos only when you tap.</p>
      </div>
    </div>
  )
}
