import { Outlet } from 'react-router-dom'
import AssistantWidget from './assistant/AssistantWidget'
import ConnectionStatus from './ConnectionStatus'
import Footer from './Footer'
import Navbar from './Navbar'

/**
 * Shared chrome for every in-app route: navbar, offline banner, footer and
 * the assistant, which stays mounted (and keeps its conversation) across
 * routes. The landing page at "/" is not wrapped in this.
 */
export default function AppLayout() {
  return (
    <div className="page">
      <Navbar />
      <ConnectionStatus />
      <main className="container">
        <Outlet />
      </main>
      <Footer />
      <AssistantWidget />
    </div>
  )
}
