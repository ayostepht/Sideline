import { AlertTriangle, Ban, CircleAlert, Cross } from "lucide-react";
import { cn } from "../lib/client/cn";
import { normalizeInjury, type InjuryTone } from "./injury";

const TONE_CLASS: Record<InjuryTone, string> = {
  warning: "bg-warning-soft text-warning",
  negative: "bg-negative-soft text-negative",
  info: "bg-info-soft text-info",
};

export interface InjuryBadgeProps {
  /** Raw status ("Questionable", "IR", ...). Healthy or unknown renders nothing. */
  status: string | null | undefined;
  /** Body part or note shown inline after the status ("Hamstring"). */
  detail?: string | null | undefined;
  className?: string;
}

export function InjuryBadge({ status, detail, className }: InjuryBadgeProps) {
  const info = normalizeInjury(status);
  if (!info) return null;
  const note = detail?.trim() ? detail.trim() : null;
  const Icon =
    info.tone === "negative"
      ? Cross
      : info.tone === "warning"
        ? AlertTriangle
        : info.key === "suspended"
          ? Ban
          : CircleAlert;
  return (
    <span
      data-testid="injury-badge"
      role="img"
      aria-label={`Injury status: ${info.full}${note ? `, ${note}` : ""}`}
      title={info.full}
      className={cn(
        "inline-flex items-center gap-1 rounded-control px-1.5 py-0.5 text-xs font-semibold leading-4 whitespace-nowrap",
        TONE_CLASS[info.tone],
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      <span aria-hidden>{note ? `${info.short}, ${note}` : info.short}</span>
    </span>
  );
}
