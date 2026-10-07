"use client";

import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { createLazyLoader, useLazyModule } from "../lib/client/lazy-module";
import { isPlayerDetailPath } from "../lib/client/nav";
import { trackModalMount } from "../lib/client/focus-return";

const loader = createLazyLoader(() => import("./player-modal-impl"));

/**
 * Shown while the dialog code loads: the same bottom sheet / centered frame, busy, without Radix.
 * Exported for tests.
 */
export function PlayerModalPlaceholder({ label }: { label?: string | undefined }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50" data-testid="player-modal-loading">
      <div
        role="dialog"
        aria-modal="true"
        aria-busy="true"
        aria-label={label ?? "Loading player"}
        className="fixed inset-x-0 bottom-0 flex max-h-[92dvh] min-h-48 w-full flex-col gap-3 rounded-t-card border bg-background p-4 pt-12 md:inset-auto md:left-1/2 md:top-1/2 md:max-w-[720px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-b-card md:p-5 md:pt-12"
      >
        <p role="status" className="text-sm text-muted-foreground">
          Loading player
        </p>
        <div className="h-8 w-2/3 animate-pulse rounded-control bg-muted motion-reduce:animate-none" />
        <div className="h-24 w-full animate-pulse rounded-control bg-muted motion-reduce:animate-none" />
      </div>
    </div>
  );
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
  const { mod: impl, failed } = useLazyModule(loader, { enabled: visible });
  useEffect(() => {
    // The dialog code could not load: fall back to the full player page rather than a dead tap.
    if (visible && failed)
      window.location.assign(window.location.pathname + window.location.search);
  }, [visible, failed]);
  if (!visible) return null;
  if (!impl) return <PlayerModalPlaceholder label={loadingLabel} />;
  return (
    <impl.PlayerModalImpl loadingLabel={loadingLabel} onClose={() => router.back()}>
      {children}
    </impl.PlayerModalImpl>
  );
}

/** The player name heading for the pop-up. Plain heading until the dialog code has loaded. */
export function PlayerModalTitle({ children }: { children: ReactNode }) {
  const { mod: impl } = useLazyModule(loader);
  if (!impl) {
    return <h1 className="min-w-0 break-words text-2xl font-bold tracking-tight">{children}</h1>;
  }
  return <impl.PlayerModalTitle>{children}</impl.PlayerModalTitle>;
}
