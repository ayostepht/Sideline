import type { Freshness } from "@sideline/shared";
import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/client/cn";
import { formatAge } from "./freshness";
import { SyncNowLazy } from "./sync-now-lazy";

export interface StaleBannerProps {
  freshness: Freshness;
  now: Date | number;
  /** Replaces the default Sync now button. */
  action?: ReactNode;
  className?: string;
}

/** Renders nothing unless stale. Non-blocking; announced politely. */
export function StaleBanner({ freshness, now, action, className }: StaleBannerProps) {
  if (!freshness.stale) return null;
  const never = freshness.updatedAt === null;
  return (
    <div
      role="status"
      data-testid="stale-banner"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[8px] border bg-warning-soft px-3 py-2 text-sm",
        className,
      )}
    >
      <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
      <p className="min-w-0 flex-1">
        {never
          ? "Data may be out of date. This league has not synced yet."
          : `Data may be out of date. Last updated ${formatAge(freshness.updatedAt, now)}.`}
      </p>
      <div className="shrink-0">{action ?? <SyncNowLazy />}</div>
    </div>
  );
}
