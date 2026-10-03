import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useScramble } from 'use-scramble'
import { LANDING_COPY, type CopyKey, type ScrambleLang } from '../lib/landingCopy'

/**
 * One conductor for every scrambling string on the landing page. Each
 * language change cascades top to bottom, one text box at a time: the next
 * box starts only when the previous one has finished scrambling.
 *
 *   2 s:   Sign in -> headline -> paragraph -> Get started -> Join -> hint  (Spanish)
 *   hold 2 s, then the same cascade into Hindi
 *   hold 2 s, then the same cascade back to English, and stop.
 *
 * Once per load, restarts on a back-forward cache restore. Reference-
 * counted, so a double mount (dev strict mode, hot reload) can never run two
 * sequences, and every timer is cleared when the last string unmounts.
 */
const ORDER: CopyKey[] = ['signin', 'headline', 'body', 'start', 'join', 'hint'] // top to bottom
const PHASES: ScrambleLang[] = ['es', 'hi', 'en']
const START_MS = 2000
const HOLD_MS = 2000
const GAP_MS = 120 // small breath between boxes
const SAFETY_MS = 6000 // if a box never reports back, move on anyway

let langs = Object.fromEntries(ORDER.map((k) => [k, 'en'])) as Record<CopyKey, ScrambleLang>
let phase = -1
let box = 0
let users = 0
let timer: ReturnType<typeof setTimeout> | undefined
let safety: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

const notify = () => listeners.forEach((l) => l())

function setBox(i: number) {
  langs = { ...langs, [ORDER[i]]: PHASES[phase] }
  notify()
  clearTimeout(safety)
  safety = setTimeout(() => boxDone(ORDER[i]), SAFETY_MS)
}

function nextPhase() {
  phase++
  box = 0
  setBox(0)
}

/** Called by a string when its scramble finishes. */
function boxDone(key: CopyKey) {
  if (phase < 0 || key !== ORDER[box]) return
  clearTimeout(safety)
  box++
  if (box < ORDER.length) {
    timer = setTimeout(() => setBox(box), GAP_MS)
  } else if (phase < PHASES.length - 1) {
    timer = setTimeout(nextPhase, HOLD_MS)
  }
}

function startConductor() {
  clearTimeout(timer)
  clearTimeout(safety)
  langs = Object.fromEntries(ORDER.map((k) => [k, 'en'])) as Record<CopyKey, ScrambleLang>
  phase = -1
  box = 0
  notify()
  timer = setTimeout(nextPhase, START_MS)
}

const onPageShow = (e: PageTransitionEvent) => {
  if (e.persisted) startConductor()
}

function useConductor(k: CopyKey): ScrambleLang {
  useEffect(() => {
    if (users++ === 0) {
      startConductor()
      addEventListener('pageshow', onPageShow)
    }
    return () => {
      if (--users === 0) {
        clearTimeout(timer)
        clearTimeout(safety)
        removeEventListener('pageshow', onPageShow)
      }
    }
  }, [])
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => langs[k],
  )
}

// Scramble glyphs from the target script only: letters (no #%&@ -
// anti-ai-slop-audit) for English/Spanish, Devanagari consonants for Hindi.
const LATIN = [...Array(26)].flatMap((_, i) => [65 + i, 97 + i]) as [number, number]
const DEVANAGARI: [number, number] = [2325, 2361] // क .. ह
const IGNORE = [' ', '.', ',', ':', '।', '¿', '?']

// Overflow mode leaves the previous language's characters in place until
// the scramble reaches them. A Hindi vowel sign left after a Latin letter
// would render as a broken dotted circle, so strip any combining mark that
// has no Devanagari letter before it. (Mixed scripts mid-change are the
// intended overflow look; broken marks are not.)
const ORPHAN_MARKS = /(^|[^ऀ-ॿ])[ऀ-ःऺ-ॏ॑-ॗॢॣ]+/g

export default function ScrambleAnimated({ k }: { k: CopyKey }) {
  const current = useConductor(k)
  const text = LANDING_COPY[k][current]
  const running = useRef(false)
  // Slow and deliberate: ~30 fps ticks, each character scrambles for a
  // while; longer strings step a little faster so no box drags on.
  const step = Math.max(1, Math.ceil(LANDING_COPY[k].es.length / 60))

  const { ref } = useScramble({
    text,
    playOnMount: false,
    overflow: true,
    overdrive: false,
    speed: 0.5,
    tick: 1,
    step,
    seed: 1,
    scramble: 8,
    range: current === 'hi' ? DEVANAGARI : LATIN,
    ignore: IGNORE,
    onAnimationFrame: (result) => {
      if (result !== text) running.current = true
      const fixed = result.replace(ORPHAN_MARKS, '$1')
      const el = ref.current
      if (fixed !== result && el) el.textContent = fixed
    },
    onAnimationEnd: () => {
      // Ignore the initial static draw; report only real scrambles.
      if (!running.current) return
      running.current = false
      boxDone(k)
    },
  })

  return (
    <span className="scramble__text" lang={current} ref={ref}>
      {LANDING_COPY[k].en}
    </span>
  )
}
