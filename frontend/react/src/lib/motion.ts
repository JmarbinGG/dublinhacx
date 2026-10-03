/**
 * Motion is off when the OS asks for reduced motion or data saver is on
 * (index.html / DataBudgetContext set html[data-motion="off"]). CSS handles
 * most of it; this is for the few places that animate from JS.
 */
export function motionAllowed(): boolean {
  if (document.documentElement.dataset.motion === 'off') return false
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * FLIP: given where an element *was* (first) and where it is now (last),
 * play the 2D affine transform between them - translate + scale only, so
 * it stays on the compositor. Uses the native Web Animations API.
 */
export function flipFrom(el: HTMLElement, first: DOMRect, duration = 220) {
  if (!motionAllowed() || typeof el.animate !== 'function') return
  const last = el.getBoundingClientRect()
  if (!last.width || !last.height) return
  const dx = first.left - last.left
  const dy = first.top - last.top
  const sx = first.width / last.width
  const sy = first.height / last.height
  el.animate(
    [
      { transformOrigin: 'top left', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.4 },
      { transformOrigin: 'top left', transform: 'none', opacity: 1 },
    ],
    { duration, easing: getComputedStyle(el).getPropertyValue('--ease-spring').trim() || 'ease-out' },
  )
}

// The grid's entrance stagger plays once per page load, never on refetches.
let staggerPlayed = false
export function takeStagger(): boolean {
  if (staggerPlayed) return false
  staggerPlayed = true
  return motionAllowed()
}
