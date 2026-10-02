import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "../lib/client/cn";
import { InjuryBadge } from "./injury-badge";
import { PositionBadge } from "./position-badge";

export interface PlayerRowProps {
  name: string;
  position: string | null | undefined;
  /** NFL team abbreviation. Omit when unknown (free agents, retired). */
  team?: string | null;
  injuryStatus?: string | null;
  /** Slot label such as "QB", "FLEX", "BN". */
  slot?: string;
  /** Right-side stat, already formatted. */
  stat?: ReactNode;
  statLabel?: string;
  highlighted?: boolean;
  /** Screen reader text for a highlighted row. */
  highlightLabel?: string;
  /** Renders the row as a link. */
  href?: string;
  /** Renders the row as a button (client parents only). */
  onClick?: () => void;
  className?: string;
}

export function PlayerRow({
  name,
  position,
  team,
  injuryStatus,
  slot,
  stat,
  statLabel,
  highlighted = false,
  highlightLabel = "Your player",
  href,
  onClick,
  className,
}: PlayerRowProps) {
  const interactive = href !== undefined || onClick !== undefined;
  const cls = cn(
    "flex min-h-11 w-full min-w-0 items-center gap-3 rounded-[8px] px-3 py-2 text-left",
    highlighted ? "bg-accent-soft" : "bg-transparent",
    interactive && "transition-colors duration-150 hover:bg-muted",
    className,
  );
  const content = (
    <>
      {slot ? (
        <span
          className="w-9 shrink-0 text-xs font-medium text-muted-foreground"
          data-testid="player-row-slot"
        >
          {slot}
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-base font-medium leading-5" title={name}>
          {highlighted ? <span className="sr-only">{highlightLabel}: </span> : null}
          {name}
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <PositionBadge position={position} />
          <span>{team ? team : "No team"}</span>
          <InjuryBadge status={injuryStatus} />
        </span>
      </span>
      {stat !== undefined ? (
        <span className="shrink-0 text-right">
          <span className="block text-base font-semibold tabular-nums">{stat}</span>
          {statLabel ? (
            <span className="block text-xs text-muted-foreground">{statLabel}</span>
          ) : null}
        </span>
      ) : null}
    </>
  );
  if (href !== undefined) {
    return (
      <Link href={href} className={cls} data-testid="player-row">
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls} data-testid="player-row">
        {content}
      </button>
    );
  }
  return (
    <div className={cls} data-testid="player-row">
      {content}
    </div>
  );
}
