import { flushSync } from 'react-dom'
import { motionAllowed } from './motion'

/**
 * Tile -> category page. With the native View Transitions API (zero bytes)
 * the tapped tile and the page header share a view-transition-name, so the
 * browser morphs one into the other. Without it, the category page FLIPs
 * its header backdrop from the tile's rect (see takeTileRect).
 */
let tileRect: DOMRect | null = null

type StartViewTransition = (cb: () => void) => { finished: Promise<void> }

export function openFromTile(tile: HTMLElement, go: () => void) {
  const start = (document as Document & { startViewTransition?: StartViewTransition }).startViewTransition
  if (!motionAllowed()) return go()

  if (start) {
    tileRect = null
    tile.style.setProperty('view-transition-name', 'category-hero')
    start
      .call(document, () => flushSync(go))
      .finished.finally(() => tile.style.removeProperty('view-transition-name'))
    return
  }
  tileRect = tile.getBoundingClientRect()
  go()
}

/** The tapped tile's rect, once - for the FLIP fallback. */
export function takeTileRect(): DOMRect | null {
  const rect = tileRect
  tileRect = null
  return rect
}
