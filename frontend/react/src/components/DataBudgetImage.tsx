import { useState } from 'react'
import { resolveImageUrl } from '../api/client'
import { formatKb, useDataBudget } from '../context/DataBudgetContext'

type Props = {
  src: string
  /** Shown before loading so the user knows the cost. Null = unknown size. */
  sizeKb: number | null | undefined
  alt: string
}

/**
 * A photo that costs nothing until the user asks for it. Until then it's a
 * placeholder stating the download size, with a "Load image" button; once
 * loaded it stays visible for the rest of the session.
 */
export default function DataBudgetImage({ src, sizeKb, alt }: Props) {
  const url = resolveImageUrl(src)
  const { isLoaded, recordLoad, usedKb, budgetKb } = useDataBudget()
  const [shown, setShown] = useState(() => isLoaded(url))
  const [failed, setFailed] = useState(false)

  if (shown && !failed) {
    return (
      <div className="budget-image">
        <img src={url} alt={alt} decoding="async" onError={() => setFailed(true)} />
      </div>
    )
  }

  const cost = sizeKb ?? 0
  const overBudget = usedKb + cost > budgetKb

  return (
    <div className="budget-image budget-image--placeholder">
      <span className="budget-image__size">{sizeKb ? formatKb(sizeKb) : 'Size unknown'}</span>
      <span className="budget-image__hint">
        {failed
          ? "Couldn't load the photo."
          : overBudget
            ? 'Over your monthly image budget'
            : 'Photo hidden to save data'}
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
