import type { Page } from "@playwright/test";

export type Theme = "light" | "dark";

/**
 * Switches the emulated prefers-color-scheme. The app follows the system scheme (PLAN.md 6.2),
 * so this is how e2e and axe checks cover both themes. Call before or after navigation.
 */
export async function setTheme(page: Page, theme: Theme): Promise<void> {
  await page.emulateMedia({ colorScheme: theme });
}

export const themes: readonly Theme[] = ["light", "dark"];
