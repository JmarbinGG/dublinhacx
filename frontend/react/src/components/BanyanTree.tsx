import { useEffect, useRef, useState } from 'react'
import { TREE } from '../generated/art'
import { motionAllowed } from '../lib/motion'

const PLAYED_KEY = 'banyan.treePlayed'

function alreadyPlayed() {
  try {
    return sessionStorage.getItem(PLAYED_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * The landing page banyan. Every path, its timing and its order were
 * computed at build time (scripts/design.mjs) - here we only play them:
 * wood and roots draw on with stroke-dashoffset (pathLength=1), leaf
 * clusters fade and scale in, then roots thicken into pillars with a
 * transform. Native Web Animations only; plays once per visit after first
 * paint; static under reduced motion or data saver. Decorative only.
 */
export default function BanyanTree() {
  const ref = useRef<SVGSVGElement>(null)
  // Decided once: animate only on the first visit with motion allowed.
  const [animate] = useState(() => motionAllowed() && !alreadyPlayed())
  const [pending, setPending] = useState(animate)

  useEffect(() => {
    if (!animate) return
    let cancelled = false
    const raf = requestAnimationFrame(() => {
      if (cancelled || !ref.current) return
      try {
        sessionStorage.setItem(PLAYED_KEY, '1')
      } catch {
        // Fine - it may just play again next time.
      }
      const easing = getComputedStyle(ref.current).getPropertyValue('--ease-out').trim() || 'ease-out'
      ref.current.querySelectorAll<SVGElement>('[data-t]').forEach((el) => {
        const [kind, start, dur] = el.dataset.t!.split(',').map(Number)
        if (kind === 1) {
          el.animate([{ opacity: 0, transform: 'scale(0.3)' }, { opacity: 0.5, transform: 'none' }], {
            duration: dur,
            delay: start,
            easing,
            fill: 'backwards',
          })
          return
        }
        el.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: dur, delay: start, easing, fill: 'backwards' })
        // Roots: once grounded, thicken into pillars (a transform, not stroke-width).
        if (kind === 2) {
          el.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(2.4)' }], {
            duration: 500,
            delay: start + dur,
            easing,
            fill: 'both',
          })
        }
      })
      setPending(false)
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [animate])

  return (
    <svg
      ref={ref}
      className={`tree${pending ? ' tree--pending' : ''}${animate ? '' : ' tree--static'}`}
      viewBox={TREE.vb.join(' ')}
      aria-hidden="true"
      focusable="false"
    >
      {TREE.rows.map(([kind, d, width, start, dur], i) => {
        const t = `${kind},${start},${dur}`
        if (kind === 1) {
          const [cx, cy, r] = d.split(' ')
          return <circle key={i} className="tree__leaf" cx={cx} cy={cy} r={r} data-t={t} />
        }
        return (
          <path
            key={i}
            className={kind === 2 ? 'tree__root' : 'tree__wood'}
            d={d}
            pathLength={1}
            strokeWidth={width}
            data-t={t}
          />
        )
      })}
    </svg>
  )
}
