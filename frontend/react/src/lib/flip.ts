import { motionAllowed } from './motion'

/**
 * FLIP for the listing grid (First, Last, Invert, Play), plain Web Animations.
 *
 * After each commit we know every card's previous resting position (First,
 * stored from the last commit) and measure its new one (Last). The inverse
 * transform is the 2D translation d = first - last; we start each card
 * there and animate to the identity. Cards contain text, so only translate
 * is used - never scale.
 *
 * - All reads happen in one pass, all writes in a second, so the browser
 *   lays out once. Positions live in a Float32Array.
 * - New cards fade in with a delay from their distance to the last tap:
 *   delay = clamp(|c - p| * k), the 2D norm, so changes ripple out from the
 *   finger.
 * - Interrupting (a filter change mid-animation) cancels the running
 *   animations, which commits their final state, then FLIPs from there.
 * - Only cards on screen animate, at most 24.
 */

const MAX_ANIMATED = 24
const DURATION = 220
const MS_PER_PX = 0.18
const MAX_DELAY = 140

// Where the user last tapped - the ripple origin.
let tapX = innerWidth / 2
let tapY = 0
addEventListener('pointerdown', (e) => ((tapX = e.clientX), (tapY = e.clientY)), { capture: true, passive: true })

export type FlipState = { keys: string[]; pos: Float32Array; running: Animation[] }

export function createFlipState(): FlipState {
  return { keys: [], pos: new Float32Array(0), running: [] }
}

/** Call after every commit that may have moved, added or removed cards. */
export function flipGrid(container: HTMLElement | null, state: FlipState) {
  if (!container) return
  // Interrupt: finish anything still playing so we measure resting layout.
  for (const a of state.running) a.cancel()
  state.running = []

  const children = Array.from(container.children) as HTMLElement[]
  const n = children.length
  // [x, y, width, height] per card, page coordinates.
  const pos = new Float32Array(n * 4)
  const keys: string[] = new Array(n)
  const sx = scrollX
  const sy = scrollY
  const vh = innerHeight

  // READ pass: every rect once, in page coordinates.
  const onScreen = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const r = children[i].getBoundingClientRect()
    keys[i] = children[i].dataset.key ?? String(i)
    pos[i * 4] = r.left + sx
    pos[i * 4 + 1] = r.top + sy
    pos[i * 4 + 2] = r.width
    pos[i * 4 + 3] = r.height
    onScreen[i] = r.bottom > 0 && r.top < vh ? 1 : 0
  }

  const previous = new Map<string, number>()
  state.keys.forEach((k, i) => previous.set(k, i))
  const prevPos = state.pos
  const animate = motionAllowed() && state.keys.length > 0 && typeof container.animate === 'function'
  state.keys = keys
  state.pos = pos
  if (!animate) return

  // WRITE pass.
  const easing = getComputedStyle(container).getPropertyValue('--ease-spring').trim() || 'ease-out'
  let count = 0
  for (let i = 0; i < n && count < MAX_ANIMATED; i++) {
    if (!onScreen[i]) continue
    const j = previous.get(keys[i])
    const el = children[i]
    if (j !== undefined) {
      const dx = prevPos[j * 4] - pos[i * 4]
      const dy = prevPos[j * 4 + 1] - pos[i * 4 + 1]
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue
      state.running.push(
        el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: DURATION, easing }),
      )
    } else {
      // New card: fade + small rise, delayed by its distance from the tap.
      const cx = pos[i * 4] - sx + pos[i * 4 + 2] / 2
      const cy = pos[i * 4 + 1] - sy + pos[i * 4 + 3] / 2
      const dist = Math.hypot(cx - tapX, cy - tapY)
      state.running.push(
        el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], {
          duration: DURATION,
          easing,
          delay: Math.min(MAX_DELAY, dist * MS_PER_PX),
          fill: 'backwards',
        }),
      )
    }
    count++
  }
}
