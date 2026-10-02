import { expect, test } from "@playwright/test";
import { DATA, L } from "./helpers/data";

const isDesktop = (width: number | undefined): boolean => (width ?? 0) >= 1024;

async function openSearch(page: import("@playwright/test").Page): Promise<void> {
  if (isDesktop(page.viewportSize()?.width)) {
    // Keyboard shortcut is a desktop feature (PLAN 6.3). Control works on every OS in the handler.
    await page.keyboard.press("Control+k");
  } else {
    await page.getByTestId("search-trigger-mobile").click();
  }
  await expect(page.getByTestId("search-dialog")).toBeVisible();
}

test.describe("Player search (ADR-009 item 11)", () => {
  test("SEARCH-1: Ctrl+K opens on desktop, the header button opens on mobile", async ({ page }) => {
    await page.goto(L);
    // Wait for hydration: the shortcut listener exists once the search trigger is interactive.
    await expect(page.getByTestId("home-page")).toBeVisible();
    await openSearch(page);
    await expect(page.getByTestId("search-input")).toBeFocused();
  });

  test("SEARCH-2: one character shows no results, 2+ show players with owner or Free agent", async ({
    page,
  }) => {
    await page.goto(L);
    await openSearch(page);
    const input = page.getByTestId("search-input");
    await input.fill("m");
    await expect(page.getByTestId("search-result")).toHaveCount(0);
    await input.fill(DATA.otherPlayerQuery);
    const hit = page.getByTestId("search-result").filter({ hasText: DATA.otherPlayerName });
    await expect(hit).toHaveCount(1);
    await expect(hit).toContainText(DATA.otherTeamName);
    await input.fill(DATA.freeAgentQuery);
    const fa = page.getByTestId("search-result").filter({ hasText: DATA.freeAgentName });
    await expect(fa).toHaveCount(1);
    await expect(fa).toContainText("Free agent");
  });

  test("SEARCH-3: Enter on a rostered player opens that team with ?highlight=", async ({
    page,
  }) => {
    await page.goto(L);
    await openSearch(page);
    await page.getByTestId("search-input").fill(DATA.otherPlayerQuery);
    await expect(
      page.getByTestId("search-result").filter({ hasText: DATA.otherPlayerName }),
    ).toHaveCount(1);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(
      new RegExp(`${L}/league/teams/${DATA.otherRosterId}\\?.*highlight=${DATA.otherPlayerId}`),
    );
    await expect(page.getByTestId("team-highlighted-row")).toContainText(DATA.otherPlayerName);
  });

  test("SEARCH-4: a free agent opens a sheet instead of navigating", async ({ page }) => {
    await page.goto(L);
    await openSearch(page);
    await page.getByTestId("search-input").fill(DATA.freeAgentQuery);
    await page.getByTestId("search-result").filter({ hasText: DATA.freeAgentName }).click();
    await expect(page.getByTestId("search-free-agent-sheet")).toContainText(DATA.freeAgentName);
    await expect(page).toHaveURL(new RegExp(`${L}$`));
  });

  test("SEARCH-5: Escape closes and the query is cleared on reopen", async ({ page }) => {
    await page.goto(L);
    await openSearch(page);
    await page.getByTestId("search-input").fill(DATA.otherPlayerQuery);
    await expect(page.getByTestId("search-result").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("search-dialog")).toBeHidden();
    await openSearch(page);
    await expect(page.getByTestId("search-input")).toHaveValue("");
    await expect(page.getByTestId("search-result")).toHaveCount(0);
  });

  test("SEARCH-6: a query with no match shows an empty message, not a crash", async ({ page }) => {
    await page.goto(L);
    await openSearch(page);
    await page.getByTestId("search-input").fill("zzzzqqqq");
    await expect(page.getByTestId("search-result")).toHaveCount(0);
    await expect(page.getByTestId("search-dialog")).toContainText(
      /no players|no results|not find/i,
    );
  });
});
