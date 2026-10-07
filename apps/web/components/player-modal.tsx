"use client";

import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { isPlayerDetailPath } from "../lib/client/nav";
import { isModalMounted, restoreTriggerFocus, trackModalMount } from "../lib/client/focus-return";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";

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
  if (!visible) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && router.back()}>
      <DialogContent
        data-testid="player-modal"
        aria-describedby={undefined}
        onCloseAutoFocus={(e) => {
          // The loading pop-up hands over to the loaded one: that is not a close, keep the trigger.
          if (isModalMounted()) {
            e.preventDefault();
            return;
          }
          if (restoreTriggerFocus()) e.preventDefault();
        }}
        className="inset-x-0 bottom-0 top-auto flex max-h-[92dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col overflow-y-auto rounded-b-none p-4 pt-12 md:inset-auto md:left-1/2 md:top-1/2 md:max-h-[85dvh] md:max-w-[720px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-b-card md:p-5 md:pt-12"
      >
        {loadingLabel ? (
          <>
            <DialogTitle className="sr-only">{loadingLabel}</DialogTitle>
            <DialogDescription className="sr-only">Loading</DialogDescription>
          </>
        ) : null}
        {children}
      </DialogContent>
    </Dialog>
  );
}
