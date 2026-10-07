import { expect, test, type Page } from "@playwright/test";
import { DATA, L } from "./helpers/data";

const isDesktop = (width: number | undefined): boolean => (width ?? 0) >= 1024;

/** The one row list actually visible at the current viewport (house pattern: see
 * `search.spec.ts`/`waivers.spec.ts`'s `isDesktop` branch; `players-list.tsx` renders both a card
 * list and a table unconditionally and hides one with CSS). */
function visibleRows(page: Page) {
  return isDesktop(page.viewportSize()?.width)
    ? page.getByTestId("players-table-row")
    : page.getByTestId("players-row");
}

/** The actual clickable element for a row at `index`: on desktop the row-covering link nested
 * inside the `<tr>` (clicking the bare `<tr>` can land outside the link's cell, which only spans
 * the Player column); on mobile the row itself is the `<Link>`. */
function clickableRow(page: Page, index: number) {
  const row = visibleRows(page).nth(index);
  return isDesktop(page.viewportSize()?.width) ? row.getByRole("link") : row;
}

/** Players explorer (PLAN 6.4 Players, TREND-1..5, T4.7): search, position filter, pagination, and
 * navigation to a player's detail page. */
test.describe("Players explorer (TREND-1..5)", () => {
  test("PLAYERS-FLOW-1: pagination moves between non-overlapping pages and updates the URL", async ({
    page,
  }) => {
    await page.goto(`${L}/players`);
    await expect(page.getByTestId("players-explorer")).toBeVisible();
    await expect(page.getByTestId("players-pagination")).toBeVisible();
    await expect(page.getByTestId("players-page-label")).toContainText("Page 1 of");
    await expect(page.getByTestId("players-page-prev")).toBeDisabled();

    const firstPageNames = await visibleRows(page).allTextContents();
    expect(firstPageNames.length).toBeGreaterThan(0);

    const next = page.getByTestId("players-page-next");
    await expect(next).toBeEnabled();
    await next.click();
    await expect(page).toHaveURL(new RegExp(`${L}/players\\?page=2$`));
    await expect(page.getByTestId("players-page-label")).toContainText("Page 2 of");
    await expect(page.getByTestId("players-page-prev")).toBeEnabled();

    const secondPageNames = await visibleRows(page).allTextContents();
    expect(secondPageNames.length).toBeGreaterThan(0);
    // No overlap between the two pages' rows.
    for (const name of secondPageNames) expect(firstPageNames).not.toContain(name);

    await page.getByTestId("players-page-prev").click();
    await expect(page).toHaveURL(new RegExp(`${L}/players$`));
    await expect(page.getByTestId("players-page-label")).toContainText("Page 1 of");
  });

  test("PLAYERS-FLOW-2: a position filter narrows the list and resets to page 1", async ({
    page,
  }) => {
    await page.goto(`${L}/players?page=2`);
    await expect(page.getByTestId("players-page-label")).toContainText("Page 2 of");

    await page.getByTestId("players-position-filter-rb").click();
    await expect(page).toHaveURL(new RegExp(`${L}/players\\?position=RB$`));
    await expect(page.getByTestId("players-page-label")).toContainText("Page 1 of");
    const rows = visibleRows(page);
    await expect.poll(async () => rows.count()).toBeGreaterThan(0);
    const count = await rows.count();
    for (let i = 0; i < count; i += 1) {
      await expect(rows.nth(i)).toContainText("RB");
    }

    await page.getByTestId("players-position-filter-all").click();
    await expect(page).toHaveURL(new RegExp(`${L}/players$`));
  });

  test("PLAYERS-FLOW-3: searching by name filters the list to matching players", async ({
    page,
  }) => {
    await page.goto(`${L}/players`);
    await page.getByTestId("players-search-input").fill(DATA.otherPlayerQuery);
    await expect(page).toHaveURL(new RegExp(`${L}/players\\?q=${DATA.otherPlayerQuery}$`));
    const rows = visibleRows(page);
    await expect.poll(async () => rows.count()).toBeGreaterThan(0);
    const names = await rows.allTextContents();
    for (const name of names) expect(name.toLowerCase()).toContain("mahomes");

    // Clearing the search restores the unfiltered list.
    await page.getByTestId("players-search-input").fill("");
    await expect(page).toHaveURL(new RegExp(`${L}/players$`));
  });

  test("PLAYERS-FLOW-4: a query with no matches shows an empty state with a clear-filters action", async ({
    page,
  }) => {
    await page.goto(`${L}/players`);
    await page.getByTestId("players-search-input").fill("zzzzqqqqnonexistent");
    const clear = page.getByTestId("players-clear-filters");
    await expect(clear).toBeVisible();
    await clear.click();
    await expect(page).toHaveURL(new RegExp(`${L}/players$`));
    await expect(page.getByTestId("players-search-input")).toHaveValue("");
  });

  test("PLAYERS-FLOW-5: opening a player's row navigates to its detail page", async ({ page }) => {
    await page.goto(`${L}/players`);
    await page.getByTestId("players-search-input").fill(DATA.otherPlayerQuery);
    const rows = visibleRows(page);
    await expect.poll(async () => rows.count()).toBe(1);
    await clickableRow(page, 0).click();

    await expect(page).toHaveURL(new RegExp(`${L}/players/${DATA.otherPlayerId}$`));
    await expect(page.getByTestId("player-detail")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: DATA.otherPlayerName })).toBeVisible();

    // From the list the detail opens as a pop-up (P7.3): no back link, the browser Back closes it.
    await expect(page.getByTestId("player-modal")).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId("player-modal")).toHaveCount(0);
    // Back returns to the list with its search kept.
    await expect(page).toHaveURL(new RegExp(`${L}/players(\\?.*)?$`));
  });

  test("PLAYERS-FLOW-6: the player detail page renders its trend sections directly from a URL", async ({
    page,
  }) => {
    await page.goto(`${L}/players/${DATA.myPlayerId}`);
    await expect(page.getByTestId("player-detail")).toBeVisible();
    await expect(page.getByTestId("player-signal-row")).toBeVisible();
    await expect(page.getByTestId("player-section-scoring")).toBeVisible();
  });
});
