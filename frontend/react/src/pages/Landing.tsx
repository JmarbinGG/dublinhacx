import { Link } from 'react-router-dom'
import logo from '../assets/logo.png'

/**
 * Marketing splash page - deliberately separate from the app itself (no
 * navbar/footer chrome, see AppLayout). "Enter the app" tunnels through to
 * the real home page at /app.
 */
export default function Landing() {
  return (
    <div className="landing">
      <Link to="/app" className="landing-logo">
        <img src={logo} alt="byproduct." className="logo-mark" />
        <span className="logo-period">.</span>
      </Link>

      <div className="landing-hero">
        <h1>Turning Byproducts Into Opportunities.</h1>
        <p>
          A marketplace for surplus materials - offcuts, overstock, excess inventory - matched
          with the people and companies who can put them to use.
        </p>
        <Link to="/app" className="primary-button landing-cta">
          Get Started &rarr;
        </Link>
        <Link to="/signin" className="landing-signin">
          Already have an account? Sign in
        </Link>
      </div>
    </div>
  )
}
