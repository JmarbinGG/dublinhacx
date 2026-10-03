/** Loading / empty / error placeholders, kept together since they are tiny. */

export function Loading({ label = 'Loading...' }: { label?: string }) {
  return (
    <p className="state" role="status" aria-live="polite">
      {label}
    </p>
  )
}

/** Static card-shaped placeholders while listings load. Deliberately no
 * shimmer: an endless animation costs battery and CPU for nothing. */
export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid" role="status" aria-label="Loading listings">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton-card" aria-hidden="true">
          <span className="skeleton-line skeleton-line--title" />
          <span className="skeleton-line" />
          <span className="skeleton-line skeleton-line--short" />
        </div>
      ))}
    </div>
  )
}

export function Empty({ message }: { message: string }) {
  return (
    <p className="state" role="status" aria-live="polite">
      {message}
    </p>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state state--error" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="secondary-button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}
