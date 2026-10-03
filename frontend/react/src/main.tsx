import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext.tsx'
import { CommunityProvider } from './context/CommunityContext.tsx'
import { DataBudgetProvider } from './context/DataBudgetContext.tsx'
import './generated/tokens.css'
import './index.css'
import './App.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <CommunityProvider>
          <DataBudgetProvider>
            <App />
          </DataBudgetProvider>
        </CommunityProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)

// Cache the app shell so repeat visits cost almost nothing (see public/sw.js).
// Production only - in dev it would serve stale modules.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
