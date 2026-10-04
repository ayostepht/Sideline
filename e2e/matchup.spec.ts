import { expect, test } from "@playwright/test";
import { DATA, L } from "./helpers/data";

/**
 * Matchup page (PLAN 5.7 SIM-1/SIM-2, T5.5a). The seeded league's current week (manifest.json
 * `currentWeek`) is 4; roster 4 (mine, `DATA.myRosterId`) and roster 3 (`DATA.otherRosterId`) are
 * each other's week 4 opponent (same hand-checked pairing `lineup.spec.ts` already documents:
 * `matchup_id: 5` for both in `tests/fixtures/sleeper/v1/league/<id>/matchups/4.json`), so the
 * default page (no `?roster=`) shows my own team's win probability against "Team 03".
 */
test.describe("Matchup (SIM-1/SIM-2)", () => {
  test("MATCHUP-FLOW-1: default visit shows win probability, score range, and swing players for the real week 4 matchup", async ({
    page,
  }) => {
    await page.goto(`${L}/matchup`);
    const matchupPage = page.getByTestId("matchup-page");
    await expect(matchupPage).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Matchup" })).toBeVisible();
    await expect(matchupPage.getByText("Week 4", { exact: true })).toBeVisible();
    await expect(
      matchupPage.getByText(`${DATA.myTeamName} vs ${DATA.otherTeamName}`),
    ).toBeVisible();

    // SIM-2: win probability, shown both as a plain-English headline and as a You/Tie/opponent
    // breakdown, every number a real percentage (not a placeholder).
    const winProb = page.getByTestId("matchup-win-probability");
    await expect(winProb).toBeVisible();
    await expect(page.getByTestId("matchup-win-probability-banner")).toContainText(
      DATA.otherTeamName,
    );
    await expect(page.getByTestId("matchup-win-probability-banner")).toContainText(/%/);
    const breakdown = winProb.getByRole("group", { name: "Win probability breakdown" });
    await expect(breakdown).toContainText(DATA.myTeamName);
    await expect(breakdown).toContainText(DATA.otherTeamName);
    await expect(breakdown).toContainText("Tie");

    // SIM-2: p10/p50/p90 score range for both teams, in the screen-reader-safe legend (the SVG
    // itself is aria-hidden, so the legend is the real accessible evidence this section works).
    const legend = page.getByTestId("score-range-legend");
    await expect(legend).toBeVisible();
    await expect(legend).toContainText(DATA.myTeamName);
    await expect(legend).toContainText(DATA.otherTeamName);

    // SIM-2: swing players, sorted by variance contribution. Week 4's starters are all
    // "not_started" (no stats recorded yet for the partial week, confirmed against the fixture),
    // so every starter carries real variance and at least one swing player renders.
    await expect(page.getByTestId("matchup-swing-list")).toBeVisible();
    await expect(page.getByTestId("matchup-swing-empty")).toHaveCount(0);
    const swingRows = page.getByTestId("matchup-swing-row");
    await expect(swingRows.first()).toBeVisible();
    expect(await swingRows.count()).toBeGreaterThan(0);
    // Every swing row shows a "+/-N pts swing" figure, not just a name.
    await expect(swingRows.first()).toContainText("pts swing");
  });
});
