import { Link } from 'react-router-dom'
import { formatKb, useDataBudget } from '../context/DataBudgetContext'

/** Compact "image data used this month" meter for the navbar. */
export default function DataMeter() {
  const { usedKb, budgetKb } = useDataBudget()
  const ratio = Math.min(1, usedKb / budgetKb)
  const tone = ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok'

  return (
    <Link to="/data-saver" className={`data-meter data-meter--${tone}`} title="Image data used this month">
      <span className="data-meter__text">
        {formatKb(usedKb)} / {formatKb(budgetKb)}
      </span>
      <span className="data-meter__bar" aria-hidden="true">
        <span style={{ width: `${ratio * 100}%` }} />
      </span>
    </Link>
  )
}
