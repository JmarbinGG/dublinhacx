import { Suspense, lazy, useCallback, useRef, useState } from 'react'
import { useDataBudget } from '../../context/DataBudgetContext'
import Icon from '../Icon'
import { t } from '../../i18n'

// The panel, its conversation state and the AI client load on first tap.
const Assistant = lazy(() => import('./AssistantWidget'))

// Off until the backend confirms the assistant stays (set VITE_ENABLE_ASSISTANT=1).
const ENABLED = import.meta.env.VITE_ENABLE_ASSISTANT === '1'

/** The only floating element: a small "Ask Banyan" button. */
export default function AssistantLauncher() {
  const { aiAnswers } = useDataBudget()
  const [open, setOpen] = useState(false)
  const [origin, setOrigin] = useState<DOMRect | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const close = useCallback(() => {
    setOpen(false)
    // Return focus to where it came from.
    setTimeout(() => buttonRef.current?.focus(), 0)
  }, [])

  if (!ENABLED || !aiAnswers) return null

  if (open) {
    return (
      <Suspense fallback={<div className="chat chat--loading" role="status">{t('chat.opening')}</div>}>
        <Assistant origin={origin} onClose={close} />
      </Suspense>
    )
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      className="launcher"
      onClick={() => {
        setOrigin(buttonRef.current?.getBoundingClientRect() ?? null)
        setOpen(true)
      }}
    >
      <Icon name="chat" />
      {t('chat.title')}
    </button>
  )
}
