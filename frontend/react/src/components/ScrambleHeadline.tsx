import { Suspense, lazy, useState } from 'react'
import { useDataBudget } from '../context/DataBudgetContext'
import { motionAllowed } from '../lib/motion'

// The scramble code (use-scramble + the sequence) loads after first paint
// and only on the landing page - it's not in the first-load bundle.
const ScrambleAnimated = lazy(() => import('./ScrambleAnimated'))

const EN = 'Share what you have. Find what you need.'

/**
 * Landing headline. English paints immediately as plain text; the
 * language scramble (English, Spanish, Hindi, English) loads afterwards.
 * Static English under reduced motion, data saver, or AI/data off.
 */
export default function ScrambleHeadline() {
  const { aiAnswers } = useDataBudget()
  const [animated] = useState(() => motionAllowed() && aiAnswers)
  if (!animated) return <h1>{EN}</h1>
  // The fallback is the same box the animated version renders (with the
  // sizers for every language), so there is no shift when it arrives.
  return (
    <Suspense fallback={<StaticBox />}>
      <ScrambleAnimated />
    </Suspense>
  )
}

const SIZERS = [
  ['en', EN],
  ['es', 'Comparte lo que tienes. Encuentra lo que necesitas.'],
  ['hi', 'जो है उसे बाँटें। जो चाहिए उसे पाएँ।'],
]

function StaticBox() {
  return (
    <h1 className="scramble">
      <span className="visually-hidden">{EN}</span>
      <span className="scramble__stack" aria-hidden="true">
        {SIZERS.map(([lang, text]) => (
          <span key={lang} className="scramble__sizer" lang={lang}>
            {text}
          </span>
        ))}
        <span className="scramble__text" lang="en">
          {EN}
        </span>
      </span>
    </h1>
  )
}
