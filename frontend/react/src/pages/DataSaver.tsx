import { BUDGET_CHOICES_MB, formatKb, useDataBudget } from '../context/DataBudgetContext'

/** /data-saver - set the monthly image budget and see what's been used. */
export default function DataSaver() {
  const { usedKb, budgetKb, budgetMb, setBudgetMb, resetUsage } = useDataBudget()
  const percent = Math.min(100, Math.round((usedKb / budgetKb) * 100))

  return (
    <section className="prose">
      <h1>Data Saver</h1>
      <p>
        Photos are the expensive part of any marketplace. Here they never load on their own:
        every photo shows its size first, and loads only when you tap <em>Load image</em>.
      </p>

      <h2>This month</h2>
      <div className="budget-summary">
        <span className="budget-summary__value">{formatKb(usedKb)}</span>
        <span> of {formatKb(budgetKb)} image budget used ({percent}%)</span>
      </div>
      <div className="data-meter__bar data-meter__bar--large" aria-hidden="true">
        <span style={{ width: `${percent}%` }} />
      </div>

      <h2>Monthly image budget</h2>
      <p>
        On a 1 GB/month plan, 25 MB is about 250-500 listing photos. Going over doesn't block
        anything - photos just ask before loading.
      </p>
      <div className="chips" role="group" aria-label="Monthly image budget">
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

      <p>
        <button type="button" className="secondary-button" onClick={resetUsage}>
          Reset this month's counter
        </button>
      </p>
      <p className="field-hint">
        This counts listing photos you load in this browser. It doesn't see other apps or the
        rest of the site, which is text and stays small.
      </p>
    </section>
  )
}
