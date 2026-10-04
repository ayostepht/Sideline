"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";

/**
 * Keeps the `<meta name="theme-color">` tag in sync with the app's actually
 * resolved theme (light or dark), including a manual in-app toggle that
 * overrides the OS/browser color-scheme preference.
 *
 * A static `media`-query-based theme-color meta tag can only ever track the
 * OS preference, so a user who picks a theme against their OS setting (e.g.
 * OS is light, app theme set to dark) would get mismatched browser chrome.
 * This renders no UI; it only keeps the single static meta tag (see
 * `app/layout.tsx`) up to date after hydration and on every theme change.
 */
const THEME_COLORS: Record<"light" | "dark", string> = {
  light: "#ffffff",
  dark: "#2a2a2a",
};

/**
 * Maps next-themes' `resolvedTheme` (the actually-applied theme, after
 * resolving "system" against the OS preference) to the ADR-011 ground color
 * for that theme. Returns `undefined` for a not-yet-resolved value (e.g. the
 * first render before next-themes has determined the resolved theme), so
 * callers can leave the existing meta content untouched rather than clear it.
 */
export function resolveThemeColor(resolvedTheme: string | undefined): string | undefined {
  if (resolvedTheme === "light" || resolvedTheme === "dark") return THEME_COLORS[resolvedTheme];
  return undefined;
}

export function ThemeColorSync() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const color = resolveThemeColor(resolvedTheme);
    if (!color) return;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute("content", color);
    }
  }, [resolvedTheme]);

  return null;
}
