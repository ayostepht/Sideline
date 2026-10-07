"use client";

/**
 * Error boundary body with no shared UI imports (no Button, no icon library). Next loads the
 * error boundary chunks on every route, so this keeps them tiny. Looks like `ErrorState`.
 */
export function ErrorStateLite({
  title,
  detail,
  onRetry,
}: {
  title: string;
  detail: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-2 px-4 py-10 text-center"
      data-testid="error-state"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-8 text-negative"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" x2="12" y1="8" y2="12" />
        <line x1="12" x2="12.01" y1="16" y2="16" />
      </svg>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="max-w-sm break-words text-sm text-muted-foreground">{detail}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-control border border-input bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
        data-testid="error-retry"
      >
        Retry
      </button>
    </div>
  );
}
