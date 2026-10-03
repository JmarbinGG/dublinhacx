import { useEffect, useState } from 'react'
import { resolveImageUrl } from '../api/client'
import { formatKb, useDataBudget } from '../context/DataBudgetContext'

type Props = {
  src: string | null | undefined
  alt: string
  /** Square avatar-style frame instead of 4:3. */
  square?: boolean
}

// The API doesn't send image sizes, so ask the server with a HEAD request
// (a few hundred bytes, no image data) and remember the answer.
const sizeCache = new Map<string, number | null>()

function useImageSize(url: string | null, enabled: boolean): number | null | undefined {
  const [size, setSize] = useState<number | null | undefined>(() => (url ? sizeCache.get(url) : null))
  useEffect(() => {
    if (!url || !enabled || sizeCache.has(url)) return
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
export default function DataBudgetImage({ src, alt, square }: Props) {
  const url = resolveImageUrl(src)
  const { isLoaded, recordLoad, usedKb, budgetKb } = useDataBudget()
  const [shown, setShown] = useState(() => (url ? isLoaded(url) : false))
  const [failed, setFailed] = useState(false)
  const sizeKb = useImageSize(url, !shown && navigator.onLine)

  if (!url) return null
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

  return (
    <div className={`${frame} budget-image--placeholder`}>
      <span className="budget-image__size">
        {sizeKb === undefined ? 'Checking size...' : sizeKb === null ? 'Size unknown' : formatKb(sizeKb)}
      </span>
      <span className="budget-image__hint">
        {failed ? "Couldn't load the photo." : overBudget ? 'Over your monthly image budget' : 'Photo hidden to save data'}
      </span>
      <button
        type="button"
        className="secondary-button budget-image__button"
        onClick={() => {
          setFailed(false)
          recordLoad(url, cost)
          setShown(true)
        }}
      >
        {failed ? 'Try again' : overBudget ? 'Load anyway' : 'Load image'}
      </button>
    </div>
  )
}
