import type { Community } from '../types'

const EARTH_RADIUS_MI = 3958.8

/** Straight-line ("as the crow flies") distance in miles. */
export function distanceMiles(a: Community, b: Community): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.sqrt(h))
}

/** "3d ago" style - short enough for a card footer. */
export function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m ago`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`
  const days = Math.round(seconds / 86400)
  return days < 60 ? `${days}d ago` : `${Math.round(days / 30)}mo ago`
}

/** Random id that also works on plain-http LAN origins, where
 * crypto.randomUUID isn't available. */
export function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto && window.isSecureContext) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}
