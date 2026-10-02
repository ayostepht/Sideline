"use client";

import { lazy, Suspense } from "react";

const SyncNowButton = lazy(() =>
  import("./sync-now-button").then((m) => ({ default: m.SyncNowButton })),
);

/** The banner is rare, so its button loads on demand. */
export function SyncNowLazy() {
  return (
    <Suspense fallback={<div className="min-h-11" aria-hidden />}>
      <SyncNowButton />
    </Suspense>
  );
}
