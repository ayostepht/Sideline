import { expect, test } from "@playwright/test";
import { DATA, L } from "./helpers/data";
import { FIXTURE } from "./helpers/servers";

/**
 * Lineup page (PLAN 6.4 Lineup, LINEUP-5/LINEUP-6/LINEUP-9, T3.9). The seeded league's current
 * week (manifest.json `currentWeek`) is 4; roster 4 (mine) and roster 3 (DATA.otherRosterId) are
 * each other's week 4 opponent (hand-checked against `tests/fixtures/sleeper/v1/league/<id>/
 * matchups/4.json`: both roster 3 and roster 4 have `matchup_id: 5`), so the default page (no
 * `?roster=`) shows mine and the roster toggle's "View opponent" link lands on `?roster=3`,
 * matching LINEUP-9's "view your current opponent" rather than an arbitrary other team.
 *
 * `data.week` on the response is always the resolved week (4, from `nfl_state`), never null, so
 * every link this page renders (mode toggle, roster toggle) carries an explicit `week=4` even
 * though the page was reached with no `?week=` of its own (confirmed against the rendered HTML,
 * not assumed).
 */
test.describe("Lineup (LINEUP-5/6/9)", () => {
  test("LINEUP-FLOW-1: default visit shows my own lineup, Projected mode, with Open in Sleeper", async ({
    page,
  }) => {
    await page.goto(`${L}/lineup`);
    await expect(page.getByTestId("lineup-page")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Lineup" })).toBeVisible();
    await expect(page.getByTestId("lineup-mine-badge")).toBeVisible();
    await expect(page.getByTestId("lineup-viewing-label")).toContainText("Your lineup");
    await expect(page.getByTestId("lineup-mode-toggle-projected")).toHaveAttribute(
      "aria-current",
      "true",
    );
    await expect(page.getByTestId("lineup-mode-toggle-safe")).not.toHaveAttribute("aria-current");
    await expect(page.getByTestId("lineup-open-in-sleeper")).toBeVisible();
    // The roster toggle offers the current opponent, not a way back to the viewer's own roster
    // (already there).
    await expect(page.getByTestId("lineup-roster-toggle-opponent")).toBeVisible();
    await expect(page.getByTestId("lineup-roster-toggle-mine")).toHaveCount(0);
  });

  test("LINEUP-FLOW-2: Safe and Upside toggles navigate, mark themselves active, and relabel the stat column", async ({
    page,
  }) => {
    await page.goto(`${L}/lineup`);

    await page.getByTestId("lineup-mode-toggle-safe").click();
    await expect(page).toHaveURL(new RegExp(`${L}/lineup\\?week=4&mode=safe$`));
    await expect(page.getByTestId("lineup-mode-toggle-safe")).toHaveAttribute(
      "aria-current",
      "true",
    );
    await expect(page.getByTestId("lineup-mode-toggle-projected")).not.toHaveAttribute(
      "aria-current",
    );
    await expect(page.getByTestId("lineup-current").getByText("Safe pts").first()).toBeVisible();

    await page.getByTestId("lineup-mode-toggle-upside").click();
    await expect(page).toHaveURL(new RegExp(`${L}/lineup\\?week=4&mode=upside$`));
    await expect(page.getByTestId("lineup-mode-toggle-upside")).toHaveAttribute(
      "aria-current",
      "true",
    );
    await expect(page.getByTestId("lineup-current").getByText("Upside pts").first()).toBeVisible();

    await page.getByTestId("lineup-mode-toggle-projected").click();
    await expect(page).toHaveURL(new RegExp(`${L}/lineup\\?week=4&mode=projected$`));
    await expect(page.getByTestId("lineup-current").getByText("Proj pts").first()).toBeVisible();
  });

  test("LINEUP-FLOW-3: the roster toggle shows the opponent's lineup read-only, and a link returns to mine", async ({
    page,
  }) => {
    await page.goto(`${L}/lineup`);
    await page.getByTestId("lineup-roster-toggle-opponent").click();
    await expect(page).toHaveURL(
      new RegExp(`${L}/lineup\\?week=4&mode=projected&roster=${DATA.otherRosterId}$`),
    );
    await expect(page.getByTestId("lineup-page")).toBeVisible();
    await expect(page.getByTestId("lineup-mine-badge")).toHaveCount(0);
    await expect(page.getByTestId("lineup-open-in-sleeper")).toHaveCount(0);
    await expect(page.getByTestId("lineup-viewing-label")).toContainText(
      `${DATA.otherTeamName}'s lineup`,
    );
    const back = page.getByTestId("lineup-roster-toggle-mine");
    await expect(back).toBeVisible();
    await back.click();
    await expect(page).toHaveURL(new RegExp(`${L}/lineup\\?week=4&mode=projected$`));
    await expect(page.getByTestId("lineup-mine-badge")).toBeVisible();
  });

  test("LINEUP-FLOW-4: an unknown roster id 404s instead of showing the preseason message", async ({
    page,
  }) => {
    const res = await page.goto(`${L}/lineup?roster=999999`);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "We could not find that page" })).toBeVisible();
    await expect(page.getByTestId("lineup-page")).toHaveCount(0);
    await expect(page.getByTestId("lineup-preseason")).toHaveCount(0);
  });

  test("LINEUP-FLOW-5: the swap list and exactly one issues-banner state render", async ({
    page,
  }) => {
    await page.goto(`${L}/lineup`);
    const swaps = page.getByTestId("lineup-swaps");
    await expect(swaps).toBeVisible();
    expect(await swaps.getByTestId("lineup-swap-row").count()).toBeGreaterThan(0);
    // LINEUP-1/LINEUP-6: the issues banner and the "no issues" message are mutually exclusive;
    // exactly one renders regardless of which this fixture's week currently has.
    const bannerCount = await page.getByTestId("lineup-issues-banner").count();
    const emptyCount = await page.getByTestId("lineup-issues-empty").count();
    expect(bannerCount + emptyCount).toBe(1);
    if (bannerCount === 1) await expect(page.getByTestId("lineup-issues-banner")).toBeVisible();
    else await expect(page.getByTestId("lineup-issues-empty")).toBeVisible();
  });

  test("LINEUP-FLOW-6: Open in Sleeper is a real new-tab link to the Sleeper league page", async ({
    page,
  }) => {
    await page.goto(`${L}/lineup`);
    const link = page.getByTestId("lineup-open-in-sleeper");
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", `https://sleeper.com/leagues/${FIXTURE.leagueId}`);
    await expect(link).toHaveAttribute("target", "_blank");
  });
});
