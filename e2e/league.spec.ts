import { expect, test, type Page } from "@playwright/test";
import { L } from "./helpers/data";

const isDesktop = (width: number | undefined): boolean => (width ?? 0) >= 1024;

/** The positional-strength grid renders both a table (desktop, `lg` and up) and a card list
 * (mobile) unconditionally, hiding one with CSS (house pattern, see `waivers.spec.ts`'s
 * `visibleRows`); both exist in the DOM at every viewport. */
function visibleHeatmapRows(page: Page) {
  return isDesktop(page.viewportSize()?.width)
    ? page.getByTestId("positional-strength-grid").getByTestId("positional-strength-grid-row")
    : page
        .getByTestId("positional-strength-grid-cards")
        .getByTestId("positional-strength-grid-row");
}

/**
 * League page (PLAN 5.8 LEAGUE-1..6, T5.5b): Standings plus five new sections (power rankings,
 * all-play record and luck, positional strength heatmap, manager tendencies, playoff odds), all
 * wired to one `getLeagueIntelligence` response for the seeded 10-team league. One meaningful
 * assertion per new section is enough here: each section's own component already has a unit test
 * covering its edge cases (see `apps/web/app/l/[leagueId]/league/_components/*.test.tsx` and
 * `apps/web/components/positional-strength-grid.test.tsx`).
 */
test.describe("League intelligence (LEAGUE-1..6)", () => {
  test("LEAGUE-FLOW-1: all five new sections render with real data for the seeded league", async ({
    page,
  }) => {
    await page.goto(`${L}/league`);
    await expect(page.getByTestId("league-page")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "League" })).toBeVisible();

    // LEAGUE-3: power rankings, one row per team, each showing a /100 score.
    const powerRows = page.getByTestId("power-rankings-row");
    await expect(powerRows.first()).toBeVisible();
    expect(await powerRows.count()).toBe(10);
    await expect(powerRows.first()).toContainText("/100");

    // LEAGUE-1/LEAGUE-2: all-play record and luck, one row per team, each with an all-play
    // percentage and a luck figure.
    const allPlayRows = page.getByTestId("all-play-luck-row");
    await expect(allPlayRows.first()).toBeVisible();
    expect(await allPlayRows.count()).toBe(10);
    await expect(allPlayRows.first()).toContainText("all-play");
    await expect(allPlayRows.first()).toContainText("luck");

    // LEAGUE-4: positional strength heatmap, one row per team, each cell showing a numeric
    // delta versus the league median.
    const heatmapRows = visibleHeatmapRows(page);
    await expect(heatmapRows.first()).toBeVisible();
    expect(await heatmapRows.count()).toBe(10);
    const firstCell = heatmapRows.first().getByTestId("positional-strength-grid-cell").first();
    await expect(firstCell).toBeVisible();
    await expect(firstCell).toContainText("vs league median");

    // LEAGUE-6: manager tendencies, one row per team. This league is rolling (non-FAAB,
    // ADR-003), so a transaction count renders and the FAAB note appears instead of bid figures.
    const tendenciesRows = page.getByTestId("manager-tendencies-row");
    await expect(tendenciesRows.first()).toBeVisible();
    expect(await tendenciesRows.count()).toBe(10);
    await expect(tendenciesRows.first()).toContainText("transactions");

    // LEAGUE-5: playoff odds. This league's `playoff_teams` setting is synced (6 of 10 teams),
    // so the real odds list renders rather than the "not available" panel.
    await expect(page.getByTestId("playoff-odds-unavailable")).toHaveCount(0);
    const playoffRows = page.getByTestId("playoff-odds-row");
    await expect(playoffRows.first()).toBeVisible();
    expect(await playoffRows.count()).toBe(10);
    await expect(playoffRows.first()).toContainText("%");
  });
});
