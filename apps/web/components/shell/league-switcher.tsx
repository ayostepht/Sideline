"use client";

import type { LeagueChoice } from "@sideline/shared";
import { ChevronsUpDown } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { cn } from "../../lib/client/cn";

const LeagueMenu = lazy(() => import("./league-menu"));

interface Props {
  leagueId: string;
  leagueName: string;
  leagues: readonly LeagueChoice[];
  /** popover for the desktop sidebar, sheet for the mobile top bar. */
  variant: "popover" | "sheet";
  className?: string;
}

export function LeagueSwitcher({ leagueId, leagueName, leagues, variant, className }: Props) {
  const [armed, setArmed] = useState(false);
  const suffix = variant === "popover" ? "desktop" : "mobile";

  if (leagues.length <= 1) {
    return (
      <div className={cn("min-w-0", className)} data-testid={`league-name-${suffix}`}>
        <p
          className={cn(
            "truncate text-sm",
            variant === "popover" ? "px-3 font-semibold" : "px-2 font-medium text-muted-foreground",
          )}
        >
          {leagueName}
        </p>
      </div>
    );
  }

  const trigger = (
    <button
      type="button"
      data-testid={`league-switcher-${suffix}`}
      aria-haspopup="dialog"
      onClick={() => setArmed(true)}
      aria-label={`League: ${leagueName}. Switch league`}
      className={cn(
        "flex min-h-11 w-full min-w-0 items-center gap-2 rounded-[8px] px-3 text-left text-sm font-semibold hover:bg-muted",
        className,
      )}
    >
      <span className="min-w-0 flex-1 truncate">{leagueName}</span>
      <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );

  return armed ? (
    <Suspense fallback={trigger}>
      <LeagueMenu leagueId={leagueId} leagues={leagues} variant={variant} trigger={trigger} />
    </Suspense>
  ) : (
    trigger
  );
}
