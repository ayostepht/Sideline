import { cn } from "../../../../lib/client/cn";

export type SeasonState = "preseason" | "offseason";

/**
 * Maps Sleeper's league status (LeagueOverview.status) to the UI season state. `in_season` and
 * any undocumented status value both return null, so the caller shows real content rather than
 * inventing a fifth UI state for an unknown value.
 */
export function seasonStateFor(status: string): SeasonState | null {
  if (status === "pre_draft" || status === "drafting") return "preseason";
  if (status === "complete") return "offseason";
  return null;
}

export interface SeasonStateNoticeProps {
  /** LeagueOverview.status, Sleeper's real league status. */
  status: string;
  /** Shown when the status maps to "preseason" (pre_draft or drafting). */
  preseasonMessage: string;
  /** Shown when the status maps to "offseason" (complete). */
  offseasonMessage: string;
  /** Base name for the data-testid, e.g. "matchup" renders "matchup-preseason" or "matchup-offseason". */
  testid: string;
  className?: string;
}

/** Renders nothing when the season is active, or the status is unrecognized. */
export function SeasonStateNotice({
  status,
  preseasonMessage,
  offseasonMessage,
  testid,
  className,
}: SeasonStateNoticeProps) {
  const state = seasonStateFor(status);
  if (state === null) return null;
  return (
    <p
      className={cn(
        "rounded-card border bg-card px-3 py-2 text-sm text-muted-foreground",
        className,
      )}
      data-testid={`${testid}-${state}`}
    >
      {state === "preseason" ? preseasonMessage : offseasonMessage}
    </p>
  );
}
