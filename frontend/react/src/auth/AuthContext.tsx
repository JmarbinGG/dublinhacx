import { createContext, useContext, useMemo, useState } from 'react'
import * as authApi from '../api/auth'
import type { AuthUser } from '../api/auth'

const STORAGE_KEY = 'byproduct.auth'

type StoredAuth = { token: string; user: AuthUser }

function readStoredAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredAuth) : null
  } catch {
    // Corrupt value, or storage blocked (private browsing, etc.) - just start logged out.
    return null
  }
}

function writeStoredAuth(value: StoredAuth | null) {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore - session just won't survive a reload in this browser.
  }
}

type AuthContextValue = {
  user: AuthUser | null
  token: string | null
  /** Throws ApiError on failure (e.g. "Invalid email or password"). */
  login: (email: string, password: string) => Promise<void>
  /** Throws ApiError on failure (e.g. "Email already registered"). */
  signup: (name: string, email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<StoredAuth | null>(() => readStoredAuth())

  const value = useMemo<AuthContextValue>(
    () => ({
      user: auth?.user ?? null,
      token: auth?.token ?? null,
      async login(email, password) {
        const response = await authApi.login(email, password)
        setAuth(response)
        writeStoredAuth(response)
      },
      async signup(name, email, password) {
        const response = await authApi.signup(name, email, password)
        setAuth(response)
        writeStoredAuth(response)
      },
      logout() {
        setAuth(null)
        writeStoredAuth(null)
      },
    }),
    [auth],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
