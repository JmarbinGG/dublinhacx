import { useEffect, useState } from 'react'
import { canCheckSize, resolveImageUrl } from '../api/client'
import { formatKb, useDataBudget } from '../context/DataBudgetContext'
import { t } from '../i18n'

type Props = {
  src: string | null | undefined
  alt: string
  /** Square avatar-style frame instead of 4:3. */
  square?: boolean
  /** Size from the API (image_size_kb). When known, no HEAD request is made. */
  knownSizeKb?: number | null
  /** Compact card slot: fixed 120px height, loaded or not. */
  compact?: boolean
}

/** Fired by "Load all images" above a grid; detail = the urls to load. */
export const LOAD_IMAGES_EVENT = 'banyan:load-images'

/** What a photo is counted as when its size is unknown. */
export const UNKNOWN_IMAGE_KB = 60

// When the API doesn't send a size, ask the server with a HEAD request
// (a few hundred bytes, no image data) and remember the answer.
const sizeCache = new Map<string, number | null>()

function useImageSize(url: string | null, enabled: boolean): number | null | undefined {
  const [size, setSize] = useState<number | null | undefined>(() =>
    !url || !canCheckSize(url) ? null : sizeCache.get(url),
  )
  useEffect(() => {
    if (!url || !enabled || !canCheckSize(url) || sizeCache.has(url)) return
    const controller = new AbortController()
    fetch(url, { method: 'HEAD', signal: controller.signal })
      .then((res) => {
        const bytes = Number(res.headers.get('Content-Length'))
        const kb = res.ok && bytes > 0 ? Math.max(1, Math.round(bytes / 1024)) : null
        sizeCache.set(url, kb)
        setSize(kb)
      })
      .catch(() => {
        if (controller.signal.aborted) return
        sizeCache.set(url, null)
        setSize(null)
      })
    return () => controller.abort()
  }, [url, enabled])
  return size
}

type Phase = 'idle' | 'loading' | 'loaded' | 'failed'

/**
 * A photo that costs nothing until the user asks for it. The slot is a fixed
 * size in every state (button, spinner, error, photo), so nothing shifts.
 * Nothing loads on its own - not even in data saver, which only skips the
 * size check. Images from hosts we don't trust are never shown.
 */
export default function DataBudgetImage({ src, alt, square, knownSizeKb, compact }: Props) {
  const url = resolveImageUrl(src)
  const { isLoaded, recordLoad, usedKb, budgetKb, saver } = useDataBudget()
  const [phase, setPhase] = useState<Phase>(() => (url && isLoaded(url) ? 'loaded' : 'idle'))
  const [attempt, setAttempt] = useState(0)
  const checkedKb = useImageSize(url, knownSizeKb == null && phase === 'idle' && navigator.onLine && !saver)
  const sizeKb = knownSizeKb ?? checkedKb ?? null

  const load = () => {
    if (!url) return
    if (phase === 'idle') recordLoad(url, sizeKb ?? UNKNOWN_IMAGE_KB)
    setAttempt((n) => n + 1)
    setPhase('loading')
  }

  // "Load all images" above the grid.
  useEffect(() => {
    if (!url || phase === 'loaded' || phase === 'loading') return
    const onLoadAll = (event: Event) => {
      if ((event as CustomEvent<string[]>).detail?.includes(url)) load()
    }
    window.addEventListener(LOAD_IMAGES_EVENT, onLoadAll)
    return () => window.removeEventListener(LOAD_IMAGES_EVENT, onLoadAll)
  })

  if (!url) return null
  const frame = `budget-image${square ? ' budget-image--square' : ''}${compact ? ' budget-image--compact' : ''}`

  const size = sizeKb ? formatKb(sizeKb) : null
  const label = size ? t('img.loadSize', { size }) : t('img.load')
  const overBudget = usedKb + (sizeKb ?? UNKNOWN_IMAGE_KB) > budgetKb

  return (
    <div className={`${frame}${phase === 'loaded' ? '' : ' budget-image--waiting'}`}>
      {(phase === 'loading' || phase === 'loaded') && (
        <img
          key={attempt}
          src={url}
          alt={alt}
          decoding="async"
          className={phase === 'loaded' ? undefined : 'budget-image__pending'}
          onLoad={() => setPhase('loaded')}
          onError={() => setPhase('failed')}
        />
      )}
      {phase === 'loading' && (
        <span className="budget-image__status" role="status">
          <span className="spinner" aria-hidden="true" />
          {t('img.loading')}
        </span>
      )}
      {(phase === 'idle' || phase === 'failed') && (
        <div className="budget-image__prompt">
          {phase === 'failed' && <span className="budget-image__error" role="alert">{t('img.couldntLoad')}</span>}
          <button
            type="button"
            className="secondary-button budget-image__button"
            onClick={load}
            aria-label={
              size ? t('img.loadForSize', { title: alt, size }) : t('img.loadFor', { title: alt })
            }
          >
            {label}
          </button>
          {phase === 'idle' && overBudget && <span className="budget-image__warn">{t('img.overBudget')}</span>}
        </div>
      )}
    </div>
  )
}
