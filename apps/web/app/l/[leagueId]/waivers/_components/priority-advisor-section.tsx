import type { WaiverPriorityAdvisor } from "@sideline/shared";
import { Clock } from "lucide-react";
import { Badge } from "../../../../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../../components/ui/card";
import { formatUntil } from "./format";

/**
 * WAIVER-6a/6d: the full waiver order and clear-time info. Always rendered, FAAB leagues included
 * (both are computed independent of `applicable`, see `getWaivers`'s module doc); only the
 * per-candidate competing-claim and claim-advice UI (rendered per row in `waiver-board.tsx`) is
 * skipped for FAAB leagues, via a short note here instead of a broken or empty subsection.
 */
export function PriorityAdvisorSection({
  advisor,
  now,
}: {
  advisor: WaiverPriorityAdvisor;
  now: Date;
}) {
  const faabNote = advisor.reasons.find((r) => r.code === "FAAB_NOT_SUPPORTED")?.label ?? null;
  return (
    <Card data-testid="waivers-priority-advisor">
      <CardHeader>
        <CardTitle>Waiver priority</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span data-testid="waivers-clear-time">
            Waivers process {formatUntil(advisor.nextClearAt, now)}
          </span>
          {advisor.waiverClearDays !== null ? (
            <span className="text-muted-foreground">
              · Dropped players clear in {advisor.waiverClearDays} day
              {advisor.waiverClearDays === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
        {faabNote ? (
          <p className="text-sm text-muted-foreground" data-testid="waivers-faab-note">
            {faabNote}
          </p>
        ) : null}
        {advisor.order.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="waivers-order-empty">
            We don&apos;t have a waiver order for this league yet.
          </p>
        ) : (
          <ol
            className="flex flex-col divide-y rounded-control border"
            data-testid="waivers-priority-order"
          >
            {advisor.order.map((entry) => (
              <li
                key={entry.rosterId}
                className={`flex min-h-11 items-center gap-2 px-3 py-1.5 text-sm ${
                  entry.isMine ? "bg-accent-soft" : ""
                }`}
                data-testid="waivers-order-row"
                data-mine={entry.isMine ? "true" : undefined}
              >
                <span className="w-6 shrink-0 text-right font-semibold tabular-nums">
                  {entry.rank}
                </span>
                <span className="min-w-0 flex-1 truncate">{entry.teamName}</span>
                {entry.isMine ? (
                  <Badge variant="you" data-testid="waivers-order-you">
                    You
                  </Badge>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
