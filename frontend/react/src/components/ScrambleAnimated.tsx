import { useEffect, useRef, useState } from 'react'
import { useScramble } from 'use-scramble'

// Have a native speaker check the Spanish and Hindi before shipping.
export const PHASES = [
  { lang: 'en', text: 'Share what you have. Find what you need.' },
  { lang: 'es', text: 'Comparte lo que tienes. Encuentra lo que necesitas.' },
  { lang: 'hi', text: 'जो है उसे बाँटें। जो चाहिए उसे पाएँ।' },
  { lang: 'en', text: 'Share what you have. Find what you need.' },
] as const

// Scramble glyphs come from the target script only - letters, not #%&@
// (anti-ai-slop-audit: no "hacker terminal" cliché), and Devanagari
// consonants for Hindi so no Latin letter ever shows mid-scramble.
const LATIN = [...Array(26)].flatMap((_, i) => [65 + i, 97 + i])
const DEVANAGARI: [number, number] = [2325, 2361] // क .. ह
const IGNORE = [' ', '.', ',', '।', '¿', '?']

const START_MS = 2000
const HOLD_MS = 2000

/**
 * The landing headline: English, then scrambles to Spanish, Hindi, and back
 * to English, once per load (restarts on a back-forward cache restore).
 *
 * - Screen readers only ever get the static English sentence; the animated
 *   copy is aria-hidden.
 * - Zero layout shift: all three versions sit invisibly in the same grid
 *   cell, so the box is always as tall as the tallest one, at every width.
 * - Static English under reduced motion, data saver, or AI/data off.
 */
export default function ScrambleAnimated() {
  const animated = true
  const [phase, setPhase] = useState(0)
  const [run, setRun] = useState(0) // bumped to replay after bfcache restore
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const current = PHASES[phase]

  const { ref } = useScramble({
    text: current.text,
    playOnMount: false,
    // overflow: false on purpose - with true, characters not yet reached keep
    // the previous language, so Latin letters sit next to Hindi and Hindi
    // vowel signs follow Latin letters (rendered as broken marks).
    overflow: false,
    overdrive: false,
    speed: 0.8,
    tick: 1,
    step: 2,
    seed: 2,
    scramble: 4,
    range: (current.lang === 'hi' ? DEVANAGARI : LATIN) as [number, number],
    ignore: IGNORE,
    onAnimationEnd: () => {
      // Hold, then move on; the last phase (English again) is the end.
      if (!animated || phase === 0 || phase === PHASES.length - 1) return
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setPhase((p) => Math.min(p + 1, PHASES.length - 1)), HOLD_MS)
    },
  })

  // Start (and restart) the sequence; cancel everything on unmount, so a
  // double mount can never run two sequences at once.
  useEffect(() => {
    if (!animated) return
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setPhase(1), START_MS)
    return () => clearTimeout(timer.current)
  }, [animated, run])

  useEffect(() => {
    if (!animated) return
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return
      setPhase(0)
      setRun((n) => n + 1)
    }
    addEventListener('pageshow', onShow)
    return () => removeEventListener('pageshow', onShow)
  }, [animated])

  return <HeadlineBox lang={current.lang} textRef={ref} />
}

/** The headline markup - shared by the static first paint and the animated
 * version, so swapping one for the other can't shift anything. */
export function HeadlineBox({ lang = 'en', textRef }: { lang?: string; textRef?: React.Ref<HTMLSpanElement> }) {
  return (
    <h1 className="scramble">
      <span className="visually-hidden">{PHASES[0].text}</span>
      <span className="scramble__stack" aria-hidden="true">
        {/* Invisible sizers: the box takes the tallest version's height. */}
        {PHASES.slice(0, 3).map((p) => (
          <span key={p.lang} className="scramble__sizer" lang={p.lang}>
            {p.text}
          </span>
        ))}
        <span className="scramble__text" lang={lang} ref={textRef}>
          {PHASES[0].text}
        </span>
      </span>
    </h1>
  )
}
