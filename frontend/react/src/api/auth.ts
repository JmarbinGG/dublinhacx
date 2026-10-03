import { request } from './client'

export type AuthUser = {
  id: number
  name: string
  email: string
  community_id?: string | null
}

export type AuthResponse = {
  token: string
  user: AuthUser
}

/** POST /api/signup - password must be 8-72 characters. */
export function signup(name: string, email: string, password: string, communityId: string | null) {
  return request<AuthResponse>('/api/signup', {
    method: 'POST',
    json: { name, email, password, community_id: communityId },
  })
}

/** POST /api/login - fails with "Invalid email or password" (401). */
export function login(email: string, password: string) {
  return request<AuthResponse>('/api/login', { method: 'POST', json: { email, password } })
}

/** POST /api/logout - revokes the token server-side. */
export function logout(token: string) {
  return request<{ status: string }>('/api/logout', { method: 'POST', token })
}

/** GET /api/me - 401s (and so signs the app out) if the token is dead. */
export function me(token: string, signal?: AbortSignal) {
  return request<AuthUser>('/api/me', { token, signal })
}
