import { useEffect, useRef, useState } from 'react'
import type { OverviewFilters } from '../api/ai'
import { useAuth } from '../auth/AuthContext'
import { useCommunities } from '../context/CommunityContext'
import { AI_ANSWER_KB, useDataBudget } from '../context/DataBudgetContext'
import { useAiOverview } from '../hooks/useAiOverview'
import { useOnline } from '../hooks/useOnline'
import { timeAgo } from '../lib/geo'
import type { Listing } from '../types'
import RuralMarketCard from './RuralMarketCard'

type Props = {
  q: string
  filters: OverviewFilters
  known: Listing[]
  onClose: () => void
}

/**
 * "Ask AI" card above the regular results. It adds to them and never hides
 * or reorders them. All model text renders as plain text; listings shown
 * come from our own data, matched by id.
 */
export default function AiOverview({ q, filters, known, onClose }: Props) {
  const { token } = useAuth()
  const { home } = useCommunities()
  const { recordAi } = useDataBudget()
  const online = useOnline()
  const { overview, picks, loading, error, cachedAt, cancel, retry } = useAiOverview(
    q,
    filters,
    home,
    token,
    true,
    known,
  )
  const [coolingDown, setCoolingDown] = useState(false)
  const counted = useRef<object | null>(null)

  // Meter each fresh answer once (cached copies cost nothing).
  useEffect(() => {
    if (overview && !cachedAt && counted.current !== overview) {
      counted.current = overview
      recordAi(AI_ANSWER_KB)
    }
  }, [overview, cachedAt, recordAi])

  function regenerate() {
    setCoolingDown(true)
    setTimeout(() => setCoolingDown(false), 2000)
    retry()
  }

  return (
    <section className="ai-card" aria-labelledby="ai-overview-title" aria-live="polite">
      <header className="ai-card__header">
        <h2 id="ai-overview-title">
          AI overview <span className="ai-card__query">"{q}"</span>
        </h2>
        <button type="button" className="link-button" onClick={onClose} aria-label="Close AI overview">
          Close
        </button>
      </header>
      <p className="ai-card__label">
        AI-generated, may be wrong · about {AI_ANSWER_KB} KB
        {overview?.demo && <span className="badge badge--demo">Demo</span>}
        {cachedAt && <> · saved {timeAgo(new Date(cachedAt).toISOString())}</>}
      </p>

      {loading && (
        <div className="ai-card__loading" role="status">
          Reading listings...
          <button type="button" className="secondary-button" onClick={cancel}>
            Cancel
          </button>
        </div>
      )}

      {error && !loading && (
        <p className="ai-card__error" role="alert">
          {online ? error : "You're offline."} The regular results below are unaffected.{' '}
          {online && (
            <button type="button" className="link-button" onClick={regenerate} disabled={coolingDown}>
              Try again
            </button>
          )}
        </p>
      )}

      {overview && !loading && (
        <>
          <p className="ai-card__summary">{overview.summary}</p>
          {picks.length > 0 && (
            <div className="grid ai-card__picks">
              {picks.map(({ listing, why }) => (
                <RuralMarketCard key={listing.id} listing={listing} note={why} />
              ))}
            </div>
          )}
          {overview.caveats.length > 0 && (
            <ul className="ai-card__caveats">
              {overview.caveats.map((caveat) => (
                <li key={caveat}>{caveat}</li>
              ))}
            </ul>
          )}
          <button type="button" className="link-button" onClick={regenerate} disabled={coolingDown || !online}>
            Ask again
          </button>
        </>
      )}
    </section>
  )
}
