import { Suspense, lazy, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import BanyanTree from '../components/BanyanTree'
import { Wordmark } from '../components/Navbar'
import ScrambleHeadline from '../components/ScrambleHeadline'
import { TREE } from '../generated/art'

// Only fetched when someone taps Get started.
const LanguageSheet = lazy(() => import('../components/LanguageSheet'))

/** The logo draws itself once per session (motion-graphics-toolkit: a logo
 * animation is a once-per-session event, not per load). The tree below is
 * different - it's the page's one signature moment and replays every load. */
function firstLogoThisSession(): boolean {
  try {
    if (sessionStorage.getItem('banyan.logoDrawn')) return false
    sessionStorage.setItem('banyan.logoDrawn', '1')
  } catch {
    // Storage blocked: just draw it.
  }
  return true
}

/** Splash page - separate from the app (no top bar, footer or assistant). */
export default function Landing() {
  const [drawLogo] = useState(firstLogoThisSession)
  const [choosing, setChoosing] = useState(false)
  const navigate = useNavigate()

  return (
    <div className="landing">
      <header className="landing__top">
        <Link to="/app" aria-label="Banyan home">
          <Wordmark draw={drawLogo} />
        </Link>
        <Link to="/signin">Sign in</Link>
      </header>

      <main className="landing__body">
        <div className="landing__text">
          <ScrambleHeadline />
          <p>
            A pump set sitting idle, a roll of drip pipe left over, someone who can fix a tractor or stitch a blouse.
            Banyan helps them reach the neighbour, or the next town over, that needs them.
          </p>
          <div className="landing__actions">
            <button type="button" className="primary-button" onClick={() => setChoosing(true)}>
              Get started
            </button>
            <Link to="/signup" className="secondary-button">
              Join
            </Link>
          </div>
          <p className="hint">Made for slow connections: text first, photos only when you tap.</p>
        </div>

        {/* Decorative: a fixed aspect-ratio box, so the tree never shifts layout. */}
        <div className="landing__tree" style={{ aspectRatio: `${TREE.vb[2]} / ${TREE.vb[3]}` }}>
          <BanyanTree />
        </div>
      </main>

      {choosing && (
        <Suspense fallback={null}>
          <LanguageSheet onClose={() => setChoosing(false)} onDone={() => navigate('/app')} />
        </Suspense>
      )}
    </div>
  )
}
