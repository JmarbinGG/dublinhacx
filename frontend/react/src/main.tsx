import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext.tsx'
import { CommunityProvider } from './context/CommunityContext.tsx'
import { DataBudgetProvider } from './context/DataBudgetContext.tsx'
import './index.css'
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
