import { expect, type Page } from "@playwright/test";

export type Theme = "light" | "dark";

/**
 * Switches the emulated prefers-color-scheme. The app follows the system scheme (PLAN.md 6.2),
 * so this is how e2e and axe checks cover both themes. Call before or after navigation.
 */
export async function setTheme(page: Page, theme: Theme): Promise<void> {
  await page.emulateMedia({ colorScheme: theme });
}

/**
 * Forces the in-app theme the way next-themes stores it (localStorage key `theme`), before any
 * page script runs, and emulates the matching system scheme. Call BEFORE `page.goto`. After
 * navigation, use `expectThemeApplied` to confirm the `.dark` class matches.
 */
export async function useTheme(page: Page, theme: Theme): Promise<void> {
  await page.addInitScript(`window.localStorage.setItem("theme", ${JSON.stringify(theme)});`);
  await setTheme(page, theme);
}

/** Asserts the `<html>` element carries (dark) or lacks (light) the `dark` class. */
export async function expectThemeApplied(page: Page, theme: Theme): Promise<void> {
  await expect(page.locator("html")).toHaveClass(
    theme === "dark" ? /(^|\s)dark(\s|$)/ : /^(?!.*\bdark\b)/,
  );
}

export const themes: readonly Theme[] = ["light", "dark"];
