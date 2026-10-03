import { Outlet } from 'react-router-dom'
import Footer from './Footer'
import Navbar from './Navbar'

/**
 * Shared chrome (navbar + footer) for every in-app route. The marketing
 * landing page at "/" is intentionally NOT wrapped in this - it's meant to
 * feel separate from the app, not like just another page inside it.
 */
export default function AppLayout() {
  return (
    <div className="page">
      <Navbar />
      <main className="container">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
