import { useEffect, useState } from 'react'
import { canCheckSize, resolveImageUrl } from '../api/client'
import { formatKb, useDataBudget } from '../context/DataBudgetContext'
import Icon, { type IconName } from './Icon'
import { t } from '../i18n'

type Props = {
  src: string | null | undefined
  alt: string
  /** Square avatar-style frame instead of 4:3. */
  square?: boolean
  /** Size from the API (image_size_kb). When known, no HEAD request is made. */
  knownSizeKb?: number | null
  /** Compact card slot: a neutral tile with this icon and the size. Same
   * height loaded or not; left out entirely in data saver mode. */
  tileIcon?: IconName
}

// The API doesn't send image sizes, so ask the server with a HEAD request
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

/**
 * A photo that costs nothing until the user asks for it. Until then it's a
 * placeholder stating the download size with a "Load image" button; once
 * loaded it stays visible for the rest of the session. Images from hosts we
 * don't trust are never shown.
 */
export default function DataBudgetImage({ src, alt, square, knownSizeKb, tileIcon }: Props) {
  const url = resolveImageUrl(src)
  const { isLoaded, recordLoad, usedKb, budgetKb, saver } = useDataBudget()
  const [shown, setShown] = useState(() => (url ? isLoaded(url) : false))
  const [failed, setFailed] = useState(false)
  // Data saver skips even the tiny HEAD request for the size.
  const checkedKb = useImageSize(url, knownSizeKb == null && !shown && navigator.onLine && !saver)
  const sizeKb = knownSizeKb ?? checkedKb

  if (!url || (tileIcon && saver && !shown)) return null
  const frame = `budget-image${square ? ' budget-image--square' : ''}`

  if (shown && !failed) {
    return (
      <div className={frame}>
        <img src={url} alt={alt} decoding="async" onError={() => setFailed(true)} />
      </div>
    )
  }

  const cost = sizeKb ?? 60 // unknown size: count a typical small photo
  const overBudget = usedKb + cost > budgetKb
  const load = () => {
    setFailed(false)
    recordLoad(url, cost)
    setShown(true)
  }

  if (tileIcon) {
    const size = sizeKb ? formatKb(sizeKb) : t('img.photo')
    return (
      <button
        type="button"
        className={`${frame} photo-tile`}
        onClick={load}
        aria-label={[t('img.loadPhoto'), sizeKb ? size : '', overBudget ? t('img.overMonthly') : ''].filter(Boolean).join(', ')}
      >
        <Icon name={failed ? 'alert' : tileIcon} />
        {/* Looks like a button so it's obvious the photo is one tap away. */}
        <span className="photo-tile__cta">
          <Icon name={failed ? 'alert' : 'image'} />
          {failed ? t('common.tryAgain') : t('img.load')}
        </span>
        <span className="photo-tile__size">
          {sizeKb ? size : ''}
          {overBudget && !failed && <span className="photo-tile__warn"> · {t('img.overBudget')}</span>}
        </span>
      </button>
    )
  }

  return (
    <div className={`${frame} budget-image--placeholder`}>
      <span className="budget-image__size">
        {sizeKb === undefined ? (saver ? t('img.photo') : t('img.checking')) : sizeKb === null ? t('img.sizeUnknown') : formatKb(sizeKb)}
      </span>
      <span className="budget-image__hint">
        {failed ? t('img.failed') : overBudget ? t('img.overImageBudget') : t('img.hidden')}
      </span>
      <button
        type="button"
        className="secondary-button budget-image__button"
        onClick={load}
      >
        {failed ? t('common.tryAgain') : overBudget ? t('img.loadAnyway') : t('img.load')}
      </button>
    </div>
  )
}
