import { Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import AssistantLauncher from './assistant/AssistantLauncher'
import ConnectionStatus from './ConnectionStatus'
import Footer from './Footer'
import Navbar from './Navbar'
import { SkeletonGrid } from './States'

/**
 * Shared chrome for every in-app route: top bar, offline banner, footer and
 * the assistant launcher. Each route fades in (150 ms) - keyed by path so
 * filter changes on the same page don't re-trigger it.
 */
export default function AppLayout() {
  const { pathname } = useLocation()

  return (
    <div className="page">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Navbar />
      <ConnectionStatus />
      <main id="main" className="container">
        <div key={pathname} className="route">
          <Suspense fallback={<SkeletonGrid count={4} />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
      <Footer />
      <AssistantLauncher />
    </div>
  )
}
