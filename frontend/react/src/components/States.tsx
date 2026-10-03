/** Loading / empty / error placeholders, kept together since they are tiny. */

export function Loading({ label = 'Loading...' }: { label?: string }) {
  return (
    <p className="state" role="status">
      {label}
    </p>
  )
}

export function Empty({ message }: { message: string }) {
  return <p className="state">{message}</p>
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
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
