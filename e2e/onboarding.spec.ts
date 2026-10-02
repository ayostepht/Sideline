import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./helpers/axe";
import { expectNoHorizontalScroll, PHONE_WIDTH } from "./helpers/no-hscroll";
import { FIXTURE } from "./helpers/servers";
import { settleAnimations } from "./helpers/settle";
import { themes, useTheme } from "./helpers/theme";

/**
 * Onboarding screens on every project, against the seeded server (it has an active league, so
 * /onboarding opens on the done view, and it has no worker). Nothing here changes stored state:
 * Start over is client-side and the API calls that would change it are answered by the test.
 * The real end-to-end flow is in onboarding-flow.spec.ts.
 */
test.describe("Onboarding screens (PLAN 6.4)", () => {
  test("ONB-1: Start over opens the username step and rejects bad usernames locally", async ({
    page,
  }) => {
    await page.goto("/onboarding");
    await expect(page.getByTestId("onboarding-done")).toBeVisible();
    await page.getByTestId("onboarding-start-over").click();
    await expect(page.getByTestId("onboarding-step-username")).toBeVisible();
    const input = page.getByTestId("onboarding-username-input");
    const submit = page.getByTestId("onboarding-username-submit");
    await input.fill("bad name!");
    await submit.click();
    await expect(page.getByTestId("onboarding-username-error")).toHaveText(/letters, numbers/i);
    await expect(input).toHaveAttribute("aria-invalid", "true");
  });

  test("ONB-2: the done view links to the active league", async ({ page }) => {
    await page.goto("/onboarding");
    await expect(page.getByTestId("onboarding-go-home")).toHaveAttribute(
      "href",
      `/l/${FIXTURE.leagueId}`,
    );
    await page.getByTestId("onboarding-go-home").click();
    await expect(page.getByTestId("home-page")).toBeVisible();
  });

  test("ONB-3: the league picker lists leagues, enables Continue on selection, and fits 390px", async ({
    page,
  }) => {
    // The status call is answered by the test so the shared seeded identity is never touched.
    const leagues = [
      {
        leagueId: FIXTURE.leagueId,
        name: "Example League",
        season: 2026,
        totalRosters: 10,
        status: "in_season",
        avatar: null,
      },
      {
        leagueId: FIXTURE.syntheticLeagueId,
        name: "Example League 2",
        season: 2026,
        totalRosters: 12,
        status: "in_season",
        avatar: null,
      },
    ];
    await page.route("**/api/onboarding", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          phase: "ready",
          user: { userId: FIXTURE.userId, username: FIXTURE.username, displayName: "manager_04" },
          leagues,
        }),
      });
    });
    await page.goto("/onboarding");
    await page.getByTestId("onboarding-start-over").click();
    await page.getByTestId("onboarding-username-input").fill(FIXTURE.username);
    await page.getByTestId("onboarding-username-submit").click();
    await expect(page.getByTestId("onboarding-step-leagues")).toBeVisible();
    await expect(page.getByTestId("onboarding-league-option")).toHaveCount(2);
    await expect(page.getByTestId("onboarding-league-submit")).toBeDisabled();
    await page.locator(`input[value="${FIXTURE.syntheticLeagueId}"]`).check({ force: true });
    await expect(page.getByTestId("onboarding-league-submit")).toBeEnabled();
    await expectNoHorizontalScroll(page, { width: PHONE_WIDTH });
    for (const theme of themes) {
      await useTheme(page, theme);
      // The Continue button fades from its disabled color; measure the settled color.
      await settleAnimations(page);
      await expectNoSeriousA11yViolations(page, { theme });
    }
  });

  test("ONB-4: without a worker the offline view appears within the client deadline", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await page.goto("/onboarding");
    await page.getByTestId("onboarding-start-over").click();
    await page.getByTestId("onboarding-username-input").fill(FIXTURE.username);
    await page.getByTestId("onboarding-username-submit").click();
    await expect(page.getByTestId("onboarding-worker-offline")).toBeVisible({ timeout: 110_000 });
    await expect(page.getByTestId("onboarding-worker-offline")).toContainText(/worker/i);
    await expect(page.getByTestId("onboarding-retry")).toBeVisible();
  });
  test("ONB-5: first-sync progress shows each job's state and fits 390px", async ({ page }) => {
    // Answered by the test: the real sync finishes in seconds and the page leaves at once, so the
    // per-job states could not be observed. Two jobs finished, one still running.
    const now = new Date().toISOString();
    const run = (job: string, status: "success" | "running") => ({
      id: 1,
      job,
      startedAt: now,
      finishedAt: status === "success" ? now : null,
      status,
      callsMade: 1,
      rowsChanged: 1,
      error: null,
    });
    const job = (name: string, status: "success" | "running") => ({
      job: name,
      lastRun: run(name, status),
      lastSuccessAt: status === "success" ? now : null,
      stale: false,
    });
    await page.route("**/api/onboarding", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          phase: "ready",
          user: { userId: FIXTURE.userId, username: FIXTURE.username, displayName: "manager_04" },
          leagues: [
            {
              leagueId: FIXTURE.leagueId,
              name: "Example League",
              season: 2026,
              totalRosters: 10,
              status: "in_season",
              avatar: null,
            },
          ],
        }),
      }),
    );
    await page.route("**/api/onboarding/league", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          activeLeagueId: FIXTURE.leagueId,
          sync: "queued",
          syncSince: new Date(Date.now() - 60_000).toISOString(),
        }),
      }),
    );
    await page.route("**/api/sync/status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          jobs: [job("league", "success"), job("users", "success"), job("rosters", "running")],
          pending: [],
        }),
      }),
    );
    await page.goto("/onboarding");
    await page.getByTestId("onboarding-start-over").click();
    await page.getByTestId("onboarding-username-input").fill(FIXTURE.username);
    await page.getByTestId("onboarding-username-submit").click();
    await page.locator(`input[value="${FIXTURE.leagueId}"]`).check({ force: true });
    await page.getByTestId("onboarding-league-submit").click();
    await expect(page.getByTestId("onboarding-sync-job-league")).toHaveAttribute(
      "data-state",
      "done",
    );
    await expect(page.getByTestId("onboarding-sync-job-users")).toHaveAttribute(
      "data-state",
      "done",
    );
    await expect(page.getByTestId("onboarding-sync-job-rosters")).toHaveAttribute(
      "data-state",
      "running",
    );
    await expectNoHorizontalScroll(page, { width: PHONE_WIDTH });
    for (const theme of themes) {
      await useTheme(page, theme);
      // The Continue button fades from its disabled color; measure the settled color.
      await settleAnimations(page);
      await expectNoSeriousA11yViolations(page, { theme });
    }
  });
});
