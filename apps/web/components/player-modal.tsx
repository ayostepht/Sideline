"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { restoreTriggerFocus } from "../lib/client/focus-return";
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
  return (
    <Dialog open onOpenChange={(open) => !open && router.back()}>
      <DialogContent
        data-testid="player-modal"
        aria-describedby={undefined}
        onCloseAutoFocus={(e) => {
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
