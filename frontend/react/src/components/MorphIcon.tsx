import { useLayoutEffect, useRef } from 'react'
import { MORPHS } from '../generated/morphs'
import { motionAllowed } from '../lib/motion'

export type MorphName = keyof typeof MORPHS

/** Polyline path for the shape at t (0 = a, 1 = b): every point is
 * a + (b - a) * t - linear interpolation of two matched vectors. */
function pathAt(name: MorphName, t: number): string {
  const { counts, a, b } = MORPHS[name]
  let d = ''
  let k = 0
  for (const n of counts) {
    for (let i = 0; i < n; i++, k += 2) {
      const x = a[k] + (b[k] - a[k]) * t
      const y = a[k + 1] + (b[k + 1] - a[k + 1]) * t
      d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
    }
  }
  return d
}

/**
 * An icon that morphs between two precomputed shapes (scripts/design.mjs
 * matched the points at build time). A 200 ms requestAnimationFrame loop
 * writes the path directly - no React re-render per frame, and a new
 * target cancels the old loop. Snaps when motion is off.
 */
export default function MorphIcon({ name, on }: { name: MorphName; on: boolean }) {
  const pathRef = useRef<SVGPathElement>(null)
  const tRef = useRef(on ? 1 : 0)

  // Layout effect: put the path back at its current shape before the
  // browser paints the new target, then animate - no one-frame flash.
  useLayoutEffect(() => {
    const path = pathRef.current
    if (!path) return
    const from = tRef.current
    const to = on ? 1 : 0
    if (from === to) return
    if (!motionAllowed()) {
      tRef.current = to
      path.setAttribute('d', pathAt(name, to))
      return
    }
    path.setAttribute('d', pathAt(name, from))
    let frame = 0
    const start = performance.now()
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / 200)
      const eased = 1 - (1 - p) ** 3 // ease-out cubic
      tRef.current = from + (to - from) * eased
      path.setAttribute('d', pathAt(name, tRef.current))
      if (p < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [name, on])

  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path ref={pathRef} d={pathAt(name, on ? 1 : 0)} />
    </svg>
  )
}
