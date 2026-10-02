import type { LucideIcon } from "lucide-react";
import { AlertCircle, Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/client/cn";
import { Button } from "./ui/button";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  message?: string;
  /** Optional action such as a Button or link. */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  message,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn("flex flex-col items-center gap-2 px-4 py-10 text-center", className)}
      data-testid="empty-state"
    >
      <Icon className="size-8 text-muted-foreground" aria-hidden />
      <h2 className="text-base font-semibold">{title}</h2>
      {message ? <p className="max-w-sm text-sm text-muted-foreground">{message}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export interface ErrorStateProps {
  /** What failed, in plain words. */
  title?: string;
  detail?: string;
  /** Client callback. Pass this or `retryHref`. */
  onRetry?: () => void;
  retryHref?: string;
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  detail,
  onRetry,
  retryHref,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn("flex flex-col items-center gap-2 px-4 py-10 text-center", className)}
      data-testid="error-state"
    >
      <AlertCircle className="size-8 text-negative" aria-hidden />
      <h2 className="text-base font-semibold">{title}</h2>
      {detail ? (
        <p className="max-w-sm break-words text-sm text-muted-foreground">{detail}</p>
      ) : null}
      {onRetry ? (
        <Button variant="outline" onClick={onRetry} className="mt-2" data-testid="error-retry">
          Retry
        </Button>
      ) : retryHref ? (
        <Button asChild variant="outline" className="mt-2" data-testid="error-retry">
          <a href={retryHref}>Retry</a>
        </Button>
      ) : null}
    </div>
  );
}
