import Icon from '../components/Icon'
import { BUDGET_CHOICES_MB, formatKb, useDataBudget } from '../context/DataBudgetContext'
import { t } from '../i18n'
import Trans from '../i18n/Trans'

/** /data-saver - data saver mode, the monthly photo budget, AI on/off. */
export default function DataSaver() {
  const { usedKb, aiKb, budgetKb, budgetMb, setBudgetMb, resetUsage, aiAnswers, setAiAnswers, saver, setSaver } =
    useDataBudget()
  const percent = Math.min(100, Math.round((usedKb / budgetKb) * 100))
  const over = usedKb >= budgetKb

  return (
    <section className="prose">
      <h1>{t('footer.dataSaver')}</h1>
      <p>
        <Trans k="saver.intro" tags={{ em: (text) => <em>{text}</em> }} />
      </p>

      <label className="toggle">
        <input type="checkbox" checked={saver} onChange={(e) => setSaver(e.target.checked)} />
        <span>
          <strong>{t('saver.mode')}</strong>
          <span className="hint"> - {t('saver.modeHint')}</span>
        </span>
      </label>

      <h2>{t('saver.thisMonth')}</h2>
      <p className="meter-line">
        {over && <Icon name="alert" />}
        <Trans
          k="saver.used"
          vars={{ used: formatKb(usedKb), budget: formatKb(budgetKb), percent }}
          tags={{ b: (text) => <strong>{text}</strong> }}
        />
        {over && ` - ${t('saver.over')}`}
      </p>
      <div className={`meter${over ? ' meter--over' : ''}`} aria-hidden="true">
        <span style={{ transform: `scaleX(${percent / 100})` }} />
      </div>
      <p className="hint">{t('saver.ai', { kb: formatKb(aiKb) })}</p>

      <h2>{t('saver.budget')}</h2>
      <p>{t('saver.budgetHint')}</p>
      <div className="segmented" role="group" aria-label={t('saver.budget')}>
        {BUDGET_CHOICES_MB.map((mb) => (
          <button key={mb} type="button" className="seg" aria-pressed={budgetMb === mb} onClick={() => setBudgetMb(mb)}>
            {mb} MB
          </button>
        ))}
      </div>

      <h2>{t('saver.aiTitle')}</h2>
      <label className="toggle">
        <input type="checkbox" checked={aiAnswers} onChange={(e) => setAiAnswers(e.target.checked)} />
        {t('saver.aiToggle')}
      </label>

      <p>
        <button type="button" className="secondary-button" onClick={resetUsage}>
          {t('saver.reset')}
        </button>
      </p>
      <p className="hint">{t('saver.note')}</p>
    </section>
  )
}
