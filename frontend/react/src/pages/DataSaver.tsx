import Icon from '../components/Icon'
import { BUDGET_CHOICES_MB, formatKb, useDataBudget } from '../context/DataBudgetContext'

/** /data-saver - data saver mode, the monthly photo budget, AI on/off. */
export default function DataSaver() {
  const { usedKb, aiKb, budgetKb, budgetMb, setBudgetMb, resetUsage, aiAnswers, setAiAnswers, saver, setSaver } =
    useDataBudget()
  const percent = Math.min(100, Math.round((usedKb / budgetKb) * 100))
  const over = usedKb >= budgetKb

  return (
    <section className="prose">
      <h1>Data saver</h1>
      <p>
        Photos are the expensive part of a marketplace, so on Banyan they never load on their own. Each one shows
        its size first and loads only when you tap <em>Load image</em>.
      </p>

      <label className="toggle">
        <input type="checkbox" checked={saver} onChange={(e) => setSaver(e.target.checked)} />
        <span>
          <strong>Data saver mode</strong>
          <span className="hint"> - no animation, and photo sizes aren't checked in advance.</span>
        </span>
      </label>

      <h2>This month</h2>
      <p className="meter-line">
        {over && <Icon name="alert" />}
        <strong>{formatKb(usedKb)}</strong> of {formatKb(budgetKb)} photo budget used ({percent}%)
        {over && ' - over budget. Photos will ask before loading.'}
      </p>
      <div className={`meter${over ? ' meter--over' : ''}`} aria-hidden="true">
        <span style={{ transform: `scaleX(${percent / 100})` }} />
      </div>
      <p className="hint">AI answers this month: about {formatKb(aiKb)}.</p>

      <h2>Monthly photo budget</h2>
      <p>On a 1 GB a month plan, 25 MB is a few hundred photos. Going over doesn't block anything.</p>
      <div className="segmented" role="group" aria-label="Monthly photo budget">
        {BUDGET_CHOICES_MB.map((mb) => (
          <button key={mb} type="button" className="seg" aria-pressed={budgetMb === mb} onClick={() => setBudgetMb(mb)}>
            {mb} MB
          </button>
        ))}
      </div>

      <h2>AI answers</h2>
      <label className="toggle">
        <input type="checkbox" checked={aiAnswers} onChange={(e) => setAiAnswers(e.target.checked)} />
        Let search use AI for questions like "things I can use to cut down a tree" (a few KB, and slower). Off means
        plain keyword search only.
      </label>

      <p>
        <button type="button" className="secondary-button" onClick={resetUsage}>
          Reset this month's counters
        </button>
      </p>
      <p className="hint">These counters only cover photos and AI answers loaded in this browser.</p>
    </section>
  )
}
