import { BUDGET_CHOICES_MB, formatKb, useDataBudget } from '../context/DataBudgetContext'

/** /data-saver - monthly photo budget, AI on/off, and what's been used. */
export default function DataSaver() {
  const { usedKb, aiKb, budgetKb, budgetMb, setBudgetMb, resetUsage, aiAnswers, setAiAnswers } = useDataBudget()
  const percent = Math.min(100, Math.round((usedKb / budgetKb) * 100))

  return (
    <section className="prose">
      <h1>Data saver</h1>
      <p>
        Photos are the expensive part of any marketplace. On Banyan they never load on their own: every photo shows
        its size first, and loads only when you tap <em>Load image</em>.
      </p>

      <h2>This month</h2>
      <div className="budget-summary">
        <span className="budget-summary__value">{formatKb(usedKb)}</span>
        <span>
          {' '}
          of {formatKb(budgetKb)} photo budget used ({percent}%)
        </span>
      </div>
      <div className="data-meter__bar data-meter__bar--large" aria-hidden="true">
        <span style={{ width: `${percent}%` }} />
      </div>
      <p className="field-hint">AI answers this month: about {formatKb(aiKb)}.</p>

      <h2>Monthly photo budget</h2>
      <p>On a 1 GB/month plan, 25 MB is a few hundred photos. Going over doesn't block anything - photos just ask first.</p>
      <div className="chips" role="group" aria-label="Monthly photo budget">
        {BUDGET_CHOICES_MB.map((mb) => (
          <button
            key={mb}
            type="button"
            className={`chip${budgetMb === mb ? ' chip--active' : ''}`}
            aria-pressed={budgetMb === mb}
            onClick={() => setBudgetMb(mb)}
          >
            {mb} MB
          </button>
        ))}
      </div>

      <h2>AI answers</h2>
      <label className="toggle-row">
        <input type="checkbox" checked={aiAnswers} onChange={(e) => setAiAnswers(e.target.checked)} />
        Show "Ask AI" and the assistant (about 2 KB per answer, only when you ask)
      </label>

      <p>
        <button type="button" className="secondary-button" onClick={resetUsage}>
          Reset this month's counters
        </button>
      </p>
      <p className="field-hint">These counters only cover photos and AI answers loaded in this browser.</p>
    </section>
  )
}
