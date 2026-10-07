"use client";

import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { isPlayerDetailPath } from "../lib/client/nav";
import { trackModalMount } from "../lib/client/focus-return";

type Impl = typeof import("./player-modal-impl");

let loaded: Impl | undefined;

/** Loads the Radix dialog code after hydration so it stays out of every route's first load. */
function useImpl(enabled: boolean): Impl | undefined {
  const [impl, setImpl] = useState<Impl | undefined>(() => loaded);
  useEffect(() => {
    if (!enabled || impl) return;
    let live = true;
    void import("./player-modal-impl").then((m) => {
      loaded = m;
      if (live) setImpl(m);
    });
    return () => {
      live = false;
    };
  }, [enabled, impl]);
  return impl;
}

/**
 * Pop-up shell for the intercepted player route. Bottom sheet on phones, centered dialog from 768px.
 * Closing (Escape, overlay, close button) goes back in history, which also drops the modal slot.
 * Radix traps focus and returns it to the name that was clicked.
 */
export function PlayerModal({
  children,
  loadingLabel,
}: {
  children: ReactNode;
  /** Set by the loading state, which has no player name yet. */
  loadingLabel?: string;
}) {
  const router = useRouter();
  // The slot keeps its last page when soft navigation leaves the player route (there is no
  // catch-all route: it made Next re-prefetch linked routes in a loop). Render nothing then.
  const pathname = usePathname();
  const { leagueId } = useParams<{ leagueId?: string }>();
  const visible = leagueId === undefined || isPlayerDetailPath(pathname, leagueId);
  useEffect(() => {
    if (!visible) return;
    trackModalMount(true);
    return () => trackModalMount(false);
  }, [visible]);
  const impl = useImpl(visible);
  if (!visible || !impl) return null;
  return (
    <impl.PlayerModalImpl loadingLabel={loadingLabel} onClose={() => router.back()}>
      {children}
    </impl.PlayerModalImpl>
  );
}

/** The player name heading for the pop-up. Plain heading until the dialog code has loaded. */
export function PlayerModalTitle({ children }: { children: ReactNode }) {
  const impl = useImpl(true);
  if (!impl) {
    return <h1 className="min-w-0 break-words text-2xl font-bold tracking-tight">{children}</h1>;
  }
  return <impl.PlayerModalTitle>{children}</impl.PlayerModalTitle>;
}
