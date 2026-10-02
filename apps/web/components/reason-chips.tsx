import { ArrowDown, ArrowUp } from "lucide-react";
import type { Reason } from "@sideline/shared";
import { cn } from "../lib/client/cn";
import { formatImpact } from "./reason-format";

export function ReasonChip({ reason }: { reason: Reason }) {
  const imp = formatImpact(reason.impact);
  const Icon = imp.sign === "up" ? ArrowUp : imp.sign === "down" ? ArrowDown : null;
  return (
    <li
      className={cn(
        "inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border bg-muted px-2.5 py-1.5 text-[13px] leading-4 sm:py-1 sm:text-xs",
        imp.sign === "up" && "text-positive",
        imp.sign === "down" && "text-negative",
        imp.sign === "none" && "text-foreground",
      )}
      data-testid="reason-chip"
    >
      {Icon ? <Icon className="size-3 shrink-0" aria-hidden /> : null}
      <span className="min-w-0 truncate text-foreground" title={reason.label}>
        {reason.label}
      </span>
      {reason.value !== undefined ? (
        <span className="shrink-0 font-medium tabular-nums text-foreground">{reason.value}</span>
      ) : null}
      {imp.sign !== "none" ? (
        <>
          <span className="shrink-0 font-medium tabular-nums" aria-hidden>
            {imp.text}
          </span>
          <span className="sr-only">{imp.spoken}</span>
        </>
      ) : null}
    </li>
  );
}

export interface ReasonChipsProps {
  reasons: ReadonlyArray<Reason>;
  /** Max chips shown before "+N more". Default shows all. */
  max?: number;
  className?: string;
  /** Rendered after the chips, usually a WhyTrigger. */
  trailing?: React.ReactNode;
}

export function ReasonChips({ reasons, max, className, trailing }: ReasonChipsProps) {
  const shown = max === undefined ? reasons : reasons.slice(0, max);
  const hidden = reasons.length - shown.length;
  if (reasons.length === 0 && !trailing) return null;
  return (
    <ul
      className={cn("flex min-w-0 flex-wrap items-center gap-1", className)}
      aria-label="Reasons"
      data-testid="reason-chips"
    >
      {shown.map((r) => (
        <ReasonChip key={r.code} reason={r} />
      ))}
      {hidden > 0 ? (
        <li className="text-[13px] text-muted-foreground tabular-nums sm:text-xs">
          +{hidden} more
        </li>
      ) : null}
      {trailing ? <li className="list-none">{trailing}</li> : null}
    </ul>
  );
}
