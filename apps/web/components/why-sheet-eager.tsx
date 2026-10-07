"use client";

import type { WhySheetProps } from "./why-sheet";
import WhySheetImpl from "./why-sheet-impl";

/**
 * Same API as `WhySheet`, bundled with the route instead of lazy-loaded. Used on Lineup, where the
 * lazy swap raced with the not-found client render (blank 404 page in about 1 in 10 runs).
 */
export function WhySheetEager(props: WhySheetProps) {
  return <WhySheetImpl {...props} />;
}
