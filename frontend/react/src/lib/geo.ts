import { formatNumber, t } from '../i18n'

export type Point = { lat: number; lng: number }

const EARTH_RADIUS_KM = 6371

/** Straight-line distance in km - same formula as the backend. */
export function distanceKm(a: Point, b: Point): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

/** "3d ago" style - short enough for a card footer. */
export function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  const n = (v: number) => formatNumber(v)
  if (seconds < 3600) return t('time.m', { n: n(Math.max(1, Math.round(seconds / 60))) })
  if (seconds < 86400) return t('time.h', { n: n(Math.round(seconds / 3600)) })
  const days = Math.round(seconds / 86400)
  return days < 60 ? t('time.d', { n: n(days) }) : t('time.mo', { n: n(Math.round(days / 30)) })
}

/** Random id that also works on plain-http LAN origins, where
 * crypto.randomUUID isn't available. */
export function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto && window.isSecureContext) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}
