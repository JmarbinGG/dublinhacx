import type { UserPrivate } from '../types'
import { request } from './client'

export type AuthUser = UserPrivate

export type AuthResponse = {
  token: string
  user: AuthUser
}

export type SignupInput = {
  name: string
  email: string
  password: string
  community?: string
  bio?: string
}

/** POST /api/auth/signup */
export function signup(input: SignupInput) {
  return request<AuthResponse>('/api/auth/signup', { method: 'POST', json: input })
}

/** POST /api/auth/login - fails with "Invalid email or password" (401). */
export function login(email: string, password: string) {
  return request<AuthResponse>('/api/auth/login', { method: 'POST', json: { email, password } })
}

/** POST /api/auth/logout - deletes the session server-side. */
export function logout(token: string) {
  return request<{ status: string }>('/api/auth/logout', { method: 'POST', token })
}

/** GET /api/auth/me - 401s (and so signs the app out) if the token is dead. */
export function me(token: string, signal?: AbortSignal) {
  return request<AuthUser>('/api/auth/me', { token, signal })
}
