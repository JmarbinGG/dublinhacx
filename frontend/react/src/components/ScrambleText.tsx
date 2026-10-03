import { Suspense, lazy, useState } from 'react'
import { useDataBudget } from '../context/DataBudgetContext'
import { LANDING_COPY, SCRAMBLE_LANGS, type CopyKey } from '../lib/landingCopy'
import { motionAllowed } from '../lib/motion'

// use-scramble + the shared clock load after first paint, landing only.
const ScrambleAnimated = lazy(() => import('./ScrambleAnimated'))

/**
 * A landing-page string that cycles English -> Spanish -> Hindi -> English.
 *
 * - Paints English immediately as plain text.
 * - Zero layout shift: all three versions sit invisibly in one grid cell,
 *   so the box (a button, the headline, the paragraph) is always as big as
 *   its biggest version, at every width.
 * - Screen readers get one static English copy; the animated text is
 *   aria-hidden.
 * - Plain English, no cycling, under reduced motion, data saver or AI/data
 *   off.
 */
export default function ScrambleText({ k, block = false }: { k: CopyKey; block?: boolean }) {
  const { aiAnswers } = useDataBudget()
  const [animated] = useState(() => motionAllowed() && aiAnswers)
  const copy = LANDING_COPY[k]
  if (!animated) return <>{copy.en}</>

  return (
    <>
      <span className="visually-hidden">{copy.en}</span>
      <span className={`scramble__stack${block ? ' scramble__stack--block' : ''}`} aria-hidden="true">
        {SCRAMBLE_LANGS.map((l) => (
          <span key={l} className="scramble__sizer" lang={l}>
            {copy[l]}
          </span>
        ))}
        <Suspense
          fallback={
            <span className="scramble__text" lang="en">
              {copy.en}
            </span>
          }
        >
          <ScrambleAnimated k={k} />
        </Suspense>
      </span>
    </>
  )
}
