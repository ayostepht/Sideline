import { cn } from "../lib/client/cn";
import { normalizePosition, positionClass } from "./position";

export interface PositionBadgeProps {
  /** Raw position string, e.g. "QB", "DST", "CB". Unknown values show as FLEX. */
  position: string | null | undefined;
  className?: string;
}

export function PositionBadge({ position, className }: PositionBadgeProps) {
  const key = normalizePosition(position);
  return (
    <span
      data-testid="position-badge"
      className={cn(
        "inline-flex min-w-9 items-center justify-center rounded-[6px] px-1.5 py-0.5 text-xs font-semibold leading-4 text-pos-fg",
        positionClass(key),
        className,
      )}
    >
      {key}
    </span>
  );
}
