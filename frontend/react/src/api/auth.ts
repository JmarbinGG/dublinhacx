import { postJSON } from './client'

export type AuthUser = {
  id: number
  name: string
  email: string
}

export type AuthResponse = {
  token: string
  user: AuthUser
}

/** POST /api/signup - fails with "Email already registered" (400) if taken. */
export function signup(name: string, email: string, password: string) {
  return postJSON<AuthResponse>('/api/signup', { name, email, password })
}

/** POST /api/login - fails with "Invalid email or password" (401). */
export function login(email: string, password: string) {
  return postJSON<AuthResponse>('/api/login', { email, password })
}
