"use client";

import { useEffect } from "react";

/**
 * Sets `document.title` after hydration. Next's metadata title is the source of truth on a hard
 * load, but a soft navigation that lands before the first page has hydrated can leave the document
 * with no <title> at all (WCAG 2.4.2). Seen on Trades: same-route Link to ?tab=analyzer, under load.
 * The page instance persists across that navigation, so the effect runs on every render (no deps)
 * to re-apply the title after the navigation commits. It renders nothing.
 */
export function PageTitle({ title }: { title: string }) {
  useEffect(() => {
    document.title = title;
  });
  return null;
}
