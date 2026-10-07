"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { isPlayerDetailPath, titlePathname } from "../../lib/client/nav";

/**
 * Path that title and active nav derive from. While the player pop-up is open the URL is the
 * player page but the page behind it is unchanged, so this returns the last non-player path.
 */
export function useShownPathname(leagueId: string): string {
  const pathname = usePathname();
  const underlying = useRef<string | null>(null);
  const shown = titlePathname(pathname, underlying.current, leagueId);
  useEffect(() => {
    if (!isPlayerDetailPath(pathname, leagueId)) underlying.current = pathname;
  }, [pathname, leagueId]);
  return shown;
}
