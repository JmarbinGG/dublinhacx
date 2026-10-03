import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import * as authApi from '../api/auth'
import type { AuthUser, SignupInput } from '../api/auth'
import { UNAUTHORIZED_EVENT } from '../api/client'

const STORAGE_KEY = 'banyan.auth'

type StoredAuth = { token: string; user: AuthUser }

function readStoredAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredAuth) : null
  } catch {
    // Corrupt value, or storage blocked (private browsing, etc.) - start logged out.
    return null
  }
}

function writeStoredAuth(value: StoredAuth | null) {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore - the session just won't survive a reload in this browser.
  }
}

type AuthContextValue = {
  user: AuthUser | null
  token: string | null
  /** Throws ApiError on failure (e.g. "Invalid email or password"). */
  login: (email: string, password: string) => Promise<void>
  signup: (input: SignupInput) => Promise<void>
  logout: () => void
  /** Replace the stored user after a profile edit. */
  setUser: (user: AuthUser) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuthState] = useState<StoredAuth | null>(() => readStoredAuth())

  function setAuth(value: StoredAuth | null) {
    setAuthState(value)
    writeStoredAuth(value)
  }

  // Any request that 401s with our token means the session is gone - sign
  // out instead of failing every request after it.
  useEffect(() => {
    const onUnauthorized = () => setAuth(null)
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [])

  // Check a stored token once on load and refresh the stored profile. A
  // network failure (offline) keeps the session; a 401 clears it above.
  const token = auth?.token ?? null
  useEffect(() => {
    if (!token) return
    const controller = new AbortController()
    authApi
      .me(token, controller.signal)
      .then((user) => setAuth({ token, user }))
      .catch(() => {})
    return () => controller.abort()
  }, [token])

  const value = useMemo<AuthContextValue>(
    () => ({
      user: auth?.user ?? null,
      token: auth?.token ?? null,
      async login(email, password) {
        setAuth(await authApi.login(email, password))
      },
      async signup(input) {
        setAuth(await authApi.signup(input))
      },
      logout() {
        if (auth?.token) authApi.logout(auth.token).catch(() => {})
        setAuth(null)
      },
      setUser(user) {
        if (auth) setAuth({ token: auth.token, user })
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
