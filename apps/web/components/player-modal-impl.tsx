"use client";

import type { ReactNode } from "react";
import { isModalMounted, restoreTriggerFocus } from "../lib/client/focus-return";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";

/** Radix dialog part of the player pop-up. Loaded by `player-modal.tsx` after hydration. */
export function PlayerModalImpl({
  children,
  loadingLabel,
  onClose,
}: {
  children: ReactNode;
  loadingLabel?: string | undefined;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
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

/** Visible player name that also names the dialog. Must render inside `PlayerModalImpl`. */
export function PlayerModalTitle({ children }: { children: ReactNode }) {
  return (
    <DialogTitle asChild className="min-w-0 break-words pr-0 text-2xl font-bold tracking-tight">
      <h1>{children}</h1>
    </DialogTitle>
  );
}
