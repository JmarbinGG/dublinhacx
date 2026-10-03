import { useEffect, useState, useSyncExternalStore } from 'react'
import { useScramble } from 'use-scramble'
import { LANDING_COPY, type CopyKey, type ScrambleLang } from '../lib/landingCopy'

/**
 * One shared clock for every scrambling string on the landing page, so the
 * whole page changes language together: English, then Spanish at 2 s,
 * Hindi at 5 s, English again at 8 s, and stop. Runs once per load and
 * restarts on a back-forward cache restore. Reference-counted, so a double
 * mount (dev strict mode, hot reload) can never start two sequences, and
 * all timers are cleared when the last string unmounts.
 */
const SCHEDULE: [number, ScrambleLang][] = [
  [2000, 'es'],
  [5000, 'hi'],
  [8000, 'en'],
]

let lang: ScrambleLang = 'en'
let users = 0
let timers: ReturnType<typeof setTimeout>[] = []
const listeners = new Set<() => void>()
const setLang = (next: ScrambleLang) => {
  lang = next
  listeners.forEach((l) => l())
}

function startClock() {
  timers.forEach(clearTimeout)
  setLang('en')
  timers = SCHEDULE.map(([at, next]) => setTimeout(() => setLang(next), at))
}

const onPageShow = (e: PageTransitionEvent) => {
  if (e.persisted) startClock()
}

function useClock(): ScrambleLang {
  useEffect(() => {
    if (users++ === 0) {
      startClock()
      addEventListener('pageshow', onPageShow)
    }
    return () => {
      if (--users === 0) {
        timers.forEach(clearTimeout)
        timers = []
        removeEventListener('pageshow', onPageShow)
      }
    }
  }, [])
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => lang,
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
  const current = useClock()
  const text = LANDING_COPY[k][current]
  // Longer strings take bigger steps, so every string resolves in ~1 s.
  const [step] = useState(() => Math.max(2, Math.ceil(LANDING_COPY[k].es.length / 40)))

  const { ref } = useScramble({
    text,
    playOnMount: false,
    overflow: true,
    overdrive: false,
    speed: 0.8,
    tick: 1,
    step,
    seed: 2,
    scramble: 4,
    range: current === 'hi' ? DEVANAGARI : LATIN,
    ignore: IGNORE,
    onAnimationFrame: (result) => {
      const fixed = result.replace(ORPHAN_MARKS, '$1')
      const el = ref.current
      if (fixed !== result && el) el.textContent = fixed
    },
  })

  return (
    <span className="scramble__text" lang={current} ref={ref}>
      {LANDING_COPY[k].en}
    </span>
  )
}
