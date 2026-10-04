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
 * The other four League sections (power rankings, all-play/luck, manager tendencies, playoff
 * odds; T6.3c) follow the same house pattern as the heatmap above: both a `<table>` (desktop,
 * `lg` and up) and a card/list (mobile) render unconditionally, and CSS hides one. Row testid is
 * `{section}-row` on mobile (the `<li>`) and `{section}-table-row` on desktop (the `<tr>`); the
 * wrapper testid is `{section}-list` / `{section}-table` respectively (confirmed in each
 * component's source, e.g. `power-rankings.tsx`).
 */
function visibleSectionRows(page: Page, section: string) {
  return isDesktop(page.viewportSize()?.width)
    ? page.getByTestId(`${section}-table`).getByTestId(`${section}-table-row`)
    : page.getByTestId(`${section}-list`).getByTestId(`${section}-row`);
}

/** The visible wrapper (list or table) for a section, for content checks whose exact wording
 * lives once in the desktop `<thead>` rather than being repeated on every row (e.g. "All-play"/
 * "Luck"/"Transactions" are column headers, not per-row text, in the `<table>` variant). */
function visibleSectionWrapper(page: Page, section: string) {
  return isDesktop(page.viewportSize()?.width)
    ? page.getByTestId(`${section}-table`)
    : page.getByTestId(`${section}-list`);
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
    const powerRows = visibleSectionRows(page, "power-rankings");
    await expect(powerRows.first()).toBeVisible();
    expect(await powerRows.count()).toBe(10);
    await expect(powerRows.first()).toContainText("/100");

    // LEAGUE-1/LEAGUE-2: all-play record and luck, one row per team, each with an all-play
    // percentage and a luck figure. The mobile card spells out "all-play (NN%)" and "+N.N luck"
    // inline; the desktop table conveys the same two figures through its "All-play"/"Luck"
    // column headers instead (standard accessible table pattern) rather than repeating the words
    // per row. So the per-row check asserts the actual formats (a percentage, a signed
    // one-decimal luck figure), which hold in both layouts, and a wrapper-level check confirms
    // the words themselves render visibly somewhere in the section.
    const allPlayRows = visibleSectionRows(page, "all-play-luck");
    await expect(allPlayRows.first()).toBeVisible();
    expect(await allPlayRows.count()).toBe(10);
    await expect(allPlayRows.first()).toContainText(/%/);
    await expect(allPlayRows.first()).toContainText(/[+-]\d+\.\d/);
    await expect(visibleSectionWrapper(page, "all-play-luck")).toContainText(/all-play/i);
    await expect(visibleSectionWrapper(page, "all-play-luck")).toContainText(/luck/i);

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
    // Same desktop-header-vs-mobile-row-text split as all-play/luck above: "Transactions" is a
    // `<thead>` column label on desktop, not per-row text, so check it at the wrapper level.
    const tendenciesRows = visibleSectionRows(page, "manager-tendencies");
    await expect(tendenciesRows.first()).toBeVisible();
    expect(await tendenciesRows.count()).toBe(10);
    await expect(visibleSectionWrapper(page, "manager-tendencies")).toContainText(/transactions?/i);

    // LEAGUE-5: playoff odds. This league's `playoff_teams` setting is synced (6 of 10 teams),
    // so the real odds list renders rather than the "not available" panel.
    await expect(page.getByTestId("playoff-odds-unavailable")).toHaveCount(0);
    const playoffRows = visibleSectionRows(page, "playoff-odds");
    await expect(playoffRows.first()).toBeVisible();
    expect(await playoffRows.count()).toBe(10);
    await expect(playoffRows.first()).toContainText("%");
  });
});
