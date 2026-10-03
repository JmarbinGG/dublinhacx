import { useEffect, useRef, useState } from 'react'
import { TREE } from '../generated/art'
import { motionAllowed } from '../lib/motion'

type Kind = 'draw' | 'fade' | 'spread' | 'fan' | 'bloom' | 'drop'

// Start state for each kind of growth (the end state is the element at rest).
const FROM: Record<Kind, Keyframe> = {
  draw: { strokeDashoffset: 1 }, // strands and limbs draw on (pathLength=1)
  fade: { opacity: 0, transform: 'scaleY(0)' }, // trunk fill rises from the base with the strands
  spread: { opacity: 0, transform: 'scaleX(0)' }, // ground patch from its centre
  fan: { opacity: 0, transform: 'scaleX(0.15)' }, // buttress roots fan out
  bloom: { opacity: 0, transform: 'scale(0.6)' }, // a canopy region
  drop: { transform: 'scaleY(0)' }, // aerial roots lengthen downward
}
const TO: Record<Kind, Keyframe> = {
  draw: { strokeDashoffset: 0 },
  fade: { opacity: 1, transform: 'none' },
  spread: { opacity: 1, transform: 'none' },
  fan: { opacity: 1, transform: 'none' },
  bloom: { opacity: 1, transform: 'none' },
  drop: { transform: 'none' },
}

const TONES = ['tree__deep', 'tree__mid', 'tree__light']

// The shot's single curve: Penner easeOutQuad, G(x) = 1 - (1 - x)^2
// (scripts/design.mjs placed every start time on it).
const G = (x: number) => 1 - (1 - x) ** 2
const LINEAR_FN = typeof CSS !== 'undefined' && CSS.supports('animation-timing-function', 'linear(0, 1)')

/**
 * Each element plays its own slice [start, start + dur] of the shared
 * curve, renormalised to 0..1 - so it decelerates with the whole tree
 * instead of moving linearly (easing skill: no linear motion on a physical
 * object), and still has no curve of its own. Sampled into CSS linear().
 */
function sliceEasing(start: number, dur: number, total: number): string {
  if (!LINEAR_FN) return 'ease-out'
  const a = G(start / total)
  const b = G(Math.min(1, (start + dur) / total))
  if (b - a < 1e-4) return 'linear'
  const pts = []
  for (let i = 0; i <= 8; i++) pts.push(((G(Math.min(1, (start + (dur * i) / 8) / total)) - a) / (b - a)).toFixed(3))
  return `linear(${pts.join(', ')})`
}

/**
 * The landing page banyan. Geometry and the whole timeline were computed at
 * build time (scripts/design.mjs, storyboard there) on one shared clock with
 * a single ease-out; each element plays its slice of that curve, so the
 * tree grows in one continuous ~4 s motion, then holds on the final frame.
 *
 * Plays on every load and when the page comes back from the back-forward
 * cache. Running animations are cancelled before starting, so a double
 * mount (dev strict mode, hot reload) can't overlap two runs. Static under
 * reduced motion or data saver. Decorative and hidden from screen readers.
 */
export default function BanyanTree() {
  const ref = useRef<SVGSVGElement>(null)
  const running = useRef<Animation[]>([])
  const [animate] = useState(motionAllowed)
  const [pending, setPending] = useState(animate)

  useEffect(() => {
    if (!animate) return
    let frame = 0

    const play = () => {
      const svg = ref.current
      if (!svg) return
      for (const anim of running.current) anim.cancel()
      running.current = []
      svg.querySelectorAll<SVGElement>('[data-a]').forEach((el) => {
        const [kind, start, dur] = el.dataset.a!.split(',') as [Kind, string, string]
        running.current.push(
          el.animate([FROM[kind], TO[kind]], {
            duration: Number(dur),
            delay: Number(start),
            easing: sliceEasing(Number(start), Number(dur), TREE.T),
            fill: 'backwards',
          }),
        )
      })
      setPending(false)
    }

    // Two frames: start strictly after first paint, never delaying load.
    frame = requestAnimationFrame(() => (frame = requestAnimationFrame(play)))
    // Restored from the back-forward cache: replay.
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) play()
    }
    addEventListener('pageshow', onShow)

    return () => {
      cancelAnimationFrame(frame)
      removeEventListener('pageshow', onShow)
      for (const anim of running.current) anim.cancel()
      running.current = []
    }
  }, [animate])

  const a = (kind: Kind, [start, dur]: readonly number[]) => `${kind},${start},${dur}`
  const { ground, strands, trunkFill, buttress, limbs, canopy, roots } = TREE

  return (
    <svg
      ref={ref}
      className={`tree${pending ? ' tree--pending' : ''}`}
      viewBox={TREE.vb.join(' ')}
      aria-hidden="true"
      focusable="false"
    >
      <g className="tree__ground" data-a={a('spread', ground.a)}>
        <ellipse cx={ground.e[0]} cy={ground.e[1]} rx={ground.e[2]} ry={ground.e[3]} />
        <path d={ground.g} />
      </g>
      {roots.map((r, i) => (
        <path key={`r${i}`} className="tree__roots" d={r.d} data-a={a('drop', r.a)} />
      ))}
      <path className="tree__fill" d={trunkFill.d} data-a={a('fade', trunkFill.a)} />
      <path className="tree__buttress" d={buttress.d} data-a={a('fan', buttress.a)} />
      {[...strands, ...limbs].map(([d, w, s, dur, tone], i) => (
        <path
          key={`w${i}`}
          className={`tree__wood tree__draw${tone ? ' tree__wood--dark' : ''}`}
          d={d}
          pathLength={1}
          strokeWidth={w}
          data-a={a('draw', [s, dur])}
        />
      ))}
      {canopy.map((g, i) => {
        const circles = []
        for (let k = 0; k < g.c.length; k += 4) {
          circles.push(<circle key={k} className={TONES[g.c[k]]} cx={g.c[k + 1]} cy={g.c[k + 2]} r={g.c[k + 3]} />)
        }
        return (
          <g key={`c${i}`} className="tree__bloom" data-a={a('bloom', g.a)}>
            {circles}
          </g>
        )
      })}
    </svg>
  )
}
