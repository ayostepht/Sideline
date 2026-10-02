import { expect, test } from "@playwright/test";
import { DATA, L } from "./helpers/data";

/** True at the `lg` breakpoint (1024px), where the sidebar and the standings table appear. */
const isDesktop = (width: number | undefined): boolean => (width ?? 0) >= 1024;

test.describe("Home (PLAN 6.4 Home v1)", () => {
  test("HOME-1: shows the team card, rank and the standings snippet with the You row", async ({
    page,
  }) => {
    await page.goto(L);
    await expect(page.getByTestId("home-page")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
    const card = page.getByTestId("home-team-card");
    await expect(card).toContainText(DATA.myTeamName);
    await expect(page.getByTestId("home-rank")).toHaveText(/^Rank \d+$/);
    await expect(page.getByTestId("home-issues")).toBeVisible();
    await expect(page.getByTestId("home-starters")).toBeVisible();
    const mine = page.getByTestId("home-standings").locator('[data-mine="true"]');
    await expect(mine).toHaveCount(1);
    await expect(mine).toContainText("You");
    await expect(mine).toContainText(DATA.myTeamName);
  });

  test("HOME-2: See full roster and See full standings link to the right pages", async ({
    page,
  }) => {
    await page.goto(L);
    await page.getByTestId("home-see-roster").click();
    await expect(page).toHaveURL(new RegExp(`${L}/team`));
    // Wait for the client navigation to render before starting another one (a goto during it is interrupted).
    await expect(page.getByTestId("team-view")).toBeVisible();
    await page.goto(L);
    await expect(page.getByTestId("home-page")).toBeVisible();
    await page.getByTestId("home-see-league").click();
    await expect(page).toHaveURL(new RegExp(`${L}/league`));
    await expect(page.getByTestId("league-page")).toBeVisible();
  });

  test("HOME-3: '/' redirects to the active league (ADR-009 item 2)", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(new RegExp(`${L}$`));
    await expect(page.getByTestId("home-page")).toBeVisible();
  });
});

test.describe("League (PLAN 6.4 League)", () => {
  test("LEAGUE-1: standings render as a table on desktop and cards on mobile, exactly one You row", async ({
    page,
  }) => {
    await page.goto(`${L}/league`);
    await expect(page.getByTestId("league-page")).toBeVisible();
    const desktop = isDesktop(page.viewportSize()?.width);
    await expect(page.getByTestId("standings-table")).toBeVisible({ visible: desktop });
    await expect(page.getByTestId("standings-cards")).toBeVisible({ visible: !desktop });
    const rows = page.locator(
      desktop ? '[data-testid="standings-row"]' : '[data-testid="standings-card"]',
    );
    await expect(rows).toHaveCount(DATA.teamCount);
    await expect(
      page.locator('[data-mine="true"]:visible'),
      "exactly one visible row is marked mine",
    ).toHaveCount(1);
    await expect(page.locator('[data-testid="standings-you"]:visible')).toHaveCount(1);
  });

  test("LEAGUE-2: every team has a roster link that opens its team page", async ({ page }) => {
    await page.goto(`${L}/league`);
    const links = page.getByTestId("league-roster-link");
    await expect(links).toHaveCount(DATA.teamCount);
    await links.first().click();
    await expect(page).toHaveURL(new RegExp(`${L}/league/teams/\\d+`));
    await expect(page.getByTestId("team-view")).toBeVisible();
  });
});

test.describe("Team detail and My Team (PLAN 6.4)", () => {
  test("TEAM-1: team detail renders starters, bench and IR sections with player rows", async ({
    page,
  }) => {
    // Roster 4 has 15 players, 1 on IR (hand-checked in the seeded DB).
    await page.goto(`${L}/league/teams/${DATA.myRosterId}`);
    await expect(page.getByTestId("team-view")).toBeVisible();
    await expect(page.getByTestId("team-section-starters")).toBeVisible();
    await expect(page.getByTestId("team-section-bench")).toBeVisible();
    await expect(page.getByTestId("team-section-ir")).toBeVisible();
    expect(await page.getByTestId("team-row").count()).toBeGreaterThan(5);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(DATA.myTeamName);
  });

  test("TEAM-2: ?highlight= marks exactly the requested player row", async ({ page }) => {
    await page.goto(`${L}/league/teams/${DATA.myRosterId}?highlight=${DATA.myPlayerId}`);
    const hit = page.getByTestId("team-highlighted-row");
    await expect(hit).toHaveCount(1);
    await expect(hit).toHaveAttribute("id", `player-${DATA.myPlayerId}`);
    await expect(hit).toContainText("Search result");
  });

  test("TEAM-3: an unknown roster id shows the not-found page", async ({ page }) => {
    // The HTTP status is 200 here (the page streams under loading.tsx); see the T2.5b report.
    await page.goto(`${L}/league/teams/9999`);
    await expect(page.getByRole("heading", { name: "We could not find that page" })).toBeVisible();
    await expect(page.getByTestId("team-view")).toHaveCount(0);
  });

  test("MYTEAM-1: My Team shows the stored user's team and matches that roster's page", async ({
    page,
  }) => {
    await page.goto(`${L}/team`);
    await expect(page.getByTestId("team-view")).toBeVisible();
    await expect(page.getByTestId("team-mine-badge")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/My Team/);
    const mineRows = await page.getByTestId("team-row").count();
    await page.goto(`${L}/league/teams/${DATA.myRosterId}`);
    await expect(page.getByTestId("team-mine-badge")).toBeVisible();
    expect(await page.getByTestId("team-row").count()).toBe(mineRows);
  });

  test("MYTEAM-2: another team's page has no Your team badge", async ({ page }) => {
    await page.goto(`${L}/league/teams/${DATA.otherRosterId}`);
    await expect(page.getByTestId("team-view")).toBeVisible();
    await expect(page.getByTestId("team-mine-badge")).toHaveCount(0);
  });
});

test.describe("States (PLAN 6.5, ADR-009 item 2)", () => {
  test("STATE-1: unknown league shows not-found with a working link", async ({ page }) => {
    const res = await page.goto(`/l/${DATA.unknownLeagueId}`);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "We could not find that page" })).toBeVisible();
    await page.getByRole("link", { name: "Go home" }).click();
    await expect(page).toHaveURL(new RegExp(`${L}$`));
    await expect(page.getByTestId("home-page")).toBeVisible();
  });

  test("STATE-2: section stubs (lineup, matchup, waivers, players) render inside the shell", async ({
    page,
  }) => {
    for (const seg of ["lineup", "matchup", "waivers", "players"]) {
      const res = await page.goto(`${L}/${seg}`);
      expect(res?.ok(), seg).toBe(true);
      await expect(page.getByRole("heading", { level: 1 }), seg).toBeVisible();
    }
  });
});
