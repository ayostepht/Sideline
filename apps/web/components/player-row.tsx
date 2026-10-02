import { ChevronRight } from "lucide-react";
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
  /** Body part shown inline next to the injury badge. */
  injuryDetail?: string | null;
  /** Extra badges on the second line (for example a bye badge). */
  meta?: ReactNode;
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
  injuryDetail,
  meta,
  highlighted = false,
  highlightLabel = "Your player",
  href,
  onClick,
  className,
}: PlayerRowProps) {
  const interactive = href !== undefined || onClick !== undefined;
  const cls = cn(
    "flex min-h-11 w-full min-w-0 items-center gap-3 rounded-[8px] border-l-4 px-3 py-1 text-left md:max-w-2xl",
    highlighted ? "border-primary bg-accent-soft" : "border-transparent bg-transparent",
    interactive && "transition-colors duration-150 hover:bg-muted active:bg-border",
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
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-base font-medium leading-5" title={name}>
            {highlighted ? <span className="sr-only">{highlightLabel}: </span> : null}
            {name}
          </span>
          {highlighted ? (
            <span
              aria-hidden
              className="shrink-0 rounded-[6px] bg-primary px-1.5 py-0.5 text-xs font-semibold leading-4 text-primary-foreground"
              data-testid="player-row-highlight-tag"
            >
              {highlightLabel}
            </span>
          ) : null}
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <PositionBadge position={position} />
          <span>{team ? team : "No team"}</span>
          <InjuryBadge status={injuryStatus} detail={injuryDetail} />
          {meta}
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
      {interactive ? (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
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
