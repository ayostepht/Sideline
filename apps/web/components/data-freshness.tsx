import type { Freshness } from "@sideline/shared";
import { AlertTriangle } from "lucide-react";
import { cn } from "../lib/client/cn";
import { formatAge } from "./freshness";

export interface DataFreshnessProps {
  freshness: Freshness;
  /** Current time, passed by the caller. */
  now: Date | number;
  className?: string;
}

export function DataFreshness({ freshness, now, className }: DataFreshnessProps) {
  const text = formatAge(freshness.updatedAt, now);
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}
      data-testid="data-freshness"
      data-stale={freshness.stale ? "true" : undefined}
    >
      {freshness.stale ? (
        <>
          <AlertTriangle className="size-3 shrink-0 text-warning" aria-hidden />
          <span className="sr-only">Out of date.</span>
        </>
      ) : null}
      {freshness.updatedAt === null ? (
        <span>{text}</span>
      ) : (
        <time dateTime={freshness.updatedAt} className="tabular-nums">
          Updated {text}
        </time>
      )}
    </span>
  );
}
