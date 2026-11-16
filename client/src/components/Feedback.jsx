export function LoadingState({ label = "Loading" }) {
  return (
    <div className="feedback-card" role="status" aria-live="polite">
      <span className="loading loading-spinner loading-sm" aria-hidden="true" />
      <span>{label}…</span>
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", message, onRetry }) {
  return (
    <section className="feedback-card feedback-card-error" role="alert">
      <div>
        <h2>{title}</h2>
        <p>{message}</p>
      </div>
      {onRetry ? (
        <button className="btn btn-outline" type="button" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </section>
  );
}

export function Notice({ children, tone = "info" }) {
  return (
    <div className={`notice notice-${tone}`} role="status">
      <span className="notice-dot" aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}
