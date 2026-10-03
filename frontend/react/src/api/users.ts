import type { CommunityStat, Profile, UserPrivate, UserPublic } from '../types'
import { request } from './client'
import { withOfflineCache, type Cached } from './offlineCache'

/**
 *   GET   /api/users/<id>?include_closed=   public profile + listings
 *   PATCH /api/users/me                     name, photo, bio, community, latitude, longitude, contact
 *   GET   /api/users?community=&q=&limit=&offset=
 *   GET   /api/communities                  [{ name, members, listings }], busiest first
 */

export function getProfile(id: string, includeClosed: boolean, signal?: AbortSignal): Promise<Cached<Profile>> {
  return withOfflineCache(`profile:${id}:${includeClosed}`, () =>
    request<Profile>(`/api/users/${encodeURIComponent(id)}`, {
      params: { include_closed: includeClosed || undefined },
      signal,
    }),
  )
}

export type ProfileUpdate = Partial<{
  name: string
  photo: string | null
  bio: string | null
  community: string | null
  latitude: number | null
  longitude: number | null
  contact: string | null
}>

export function updateMe(changes: ProfileUpdate, token: string): Promise<UserPrivate> {
  return request<UserPrivate>('/api/users/me', { method: 'PATCH', json: changes, token })
}

export function listUsers(
  params: { community?: string; q?: string; limit?: number; offset?: number },
  signal?: AbortSignal,
): Promise<Cached<UserPublic[]>> {
  return withOfflineCache(`users:${JSON.stringify(params)}`, () =>
    request<UserPublic[]>('/api/users', { params, signal }),
  )
}

export function listCommunities(signal?: AbortSignal): Promise<Cached<CommunityStat[]>> {
  return withOfflineCache('communities', () => request<CommunityStat[]>('/api/communities', { signal }))
}
