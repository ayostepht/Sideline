import { expect, type Page } from "@playwright/test";

/**
 * Types into the Players explorer search box and waits until the explorer has actually applied it.
 *
 * Why not a bare `fill`: `players-explorer.tsx` is a client component. A change event dispatched
 * before React hydrates is lost (the input keeps the text but the list is never filtered; seen on
 * CI WebKit, and reproduced locally by delaying the JS chunks). The explorer applies a query by
 * fetching and then calling `history.replaceState`, so `?q=` in the URL is the observable "the
 * query was applied" signal. We retry until it appears: each attempt clears first, because once
 * React has hydrated it tracks the DOM value and a second `fill` of the same text would not raise
 * a new change event.
 */
export async function searchPlayers(page: Page, query: string): Promise<void> {
  const input = page.getByTestId("players-search-input");
  await expect(input).toBeVisible();
  await expect(async () => {
    await input.fill("");
    await input.fill(query);
    await expect(page).toHaveURL(/[?&]q=/, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}
