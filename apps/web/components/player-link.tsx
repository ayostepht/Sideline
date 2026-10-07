"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "../lib/client/cn";
import { rememberTrigger } from "../lib/client/focus-return";
import { playerHref } from "../lib/client/nav";

/**
 * The one way to render a player's name. Links to `/l/<leagueId>/players/<playerId>`; the league
 * comes from the current URL so call sites need no prop plumbing. Inside a league it opens the
 * player pop-up (intercepting route). Outside a league (gallery) it renders plain text.
 *
 * `stretch` extends the link's hit area over the nearest `relative` ancestor (a row), so the whole
 * row is a 44px target without nesting interactive elements. Other interactive children of that
 * row then need `relative z-10`.
 */
export function PlayerLink({
  playerId,
  children,
  className,
  stretch = false,
  title,
}: {
  playerId: string;
  children: ReactNode;
  className?: string;
  stretch?: boolean;
  title?: string;
}) {
  const params = useParams<{ leagueId?: string }>();
  const leagueId = params?.leagueId;
  if (!leagueId) {
    return (
      <span className={className} title={title}>
        {children}
      </span>
    );
  }
  return (
    <Link
      href={playerHref(leagueId, playerId)}
      title={title}
      data-testid="player-link"
      onClick={(e) => rememberTrigger(e.currentTarget)}
      className={cn(
        "rounded-control underline-offset-4 hover:underline focus-visible:underline",
        stretch && "after:absolute after:inset-0 after:content-['']",
        className,
      )}
    >
      {children}
    </Link>
  );
}
