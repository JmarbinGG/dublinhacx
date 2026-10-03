import { Suspense, lazy, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import BanyanTree from '../components/BanyanTree'
import { Wordmark } from '../components/Navbar'
import ScrambleText from '../components/ScrambleText'
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
        <Link to="/signin">
          <ScrambleText k="signin" />
        </Link>
      </header>

      <main className="landing__body">
        <div className="landing__text">
          <h1 className="scramble">
            <ScrambleText k="headline" block />
          </h1>
          <p className="scramble">
            <ScrambleText k="body" block />
          </p>
          <div className="landing__actions">
            <button type="button" className="primary-button" onClick={() => setChoosing(true)}>
              <ScrambleText k="start" />
            </button>
            <Link to="/signup" className="secondary-button">
              <ScrambleText k="join" />
            </Link>
          </div>
          <p className="hint scramble">
            <ScrambleText k="hint" block />
          </p>
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
