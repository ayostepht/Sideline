import { expect, test } from "@playwright/test";
import { z } from "zod";
import { FIXTURE, onboardingBaseUrl } from "./helpers/servers";

/**
 * Full first-run flow on the onboarding server (fresh DATA_DIR, fixture-mode worker, no network).
 * Its state is shared and one-way (once a league is chosen the server is "done"), so this spec runs
 * in desktop-chromium only (playwright.config.ts `testIgnore` on the mobile projects) and serially.
 * The same screens are covered on every project against the seeded server in onboarding.spec.ts.
 * Supersedes the T2.5a API-only ONBOARD-1 test (the UI flow asserts the same league list).
 */
test.describe.configure({ mode: "serial" });

const SyncStatus = z.object({
  jobs: z.array(
    z.object({ job: z.string(), lastRun: z.object({ status: z.string() }).nullable() }),
  ),
});
const Health = z.object({ worker: z.object({ status: z.string() }) });

test("HOST-3: fixture worker heartbeat is ok on the onboarding server within 30 s", async ({
  request,
}) => {
  await expect
    .poll(
      async () => {
        const res = await request.get(`${onboardingBaseUrl}/api/health`);
        return Health.parse(await res.json()).worker.status;
      },
      { timeout: 30_000, message: "worker heartbeat never became ok" },
    )
    .toBe("ok");
});

test("ONB-F1: username, league pick, first sync and landing on Home", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(`${onboardingBaseUrl}/onboarding`);
  await expect(page.getByTestId("onboarding-step-username")).toBeVisible();

  // Validation error before any request is made.
  await page.getByTestId("onboarding-username-input").fill("not a name!");
  await page.getByTestId("onboarding-username-submit").click();
  await expect(page.getByTestId("onboarding-username-error")).toBeVisible();
  await expect(page.getByTestId("onboarding-step-username")).toBeVisible();

  await page.getByTestId("onboarding-username-input").fill(FIXTURE.username);
  await page.getByTestId("onboarding-username-submit").click();

  // The lookup runs in the worker; the picker lists the user's leagues.
  const leagues = page.getByTestId("onboarding-league-option");
  await expect(page.getByTestId("onboarding-step-leagues")).toBeVisible({ timeout: 60_000 });
  await expect(leagues).toHaveCount(2);
  await expect(leagues.filter({ hasText: "Example League 2" })).toHaveCount(1);
  await expect(leagues.filter({ hasText: /^Example League(?! 2)/ })).toHaveCount(1);

  await page.locator(`input[value="${FIXTURE.leagueId}"]`).check({ force: true });
  await page.getByTestId("onboarding-league-submit").click();

  // First sync: the three job rows show, then the page leaves for Home once all are done. (The
  // fixture sync takes seconds and the redirect is immediate, so per-job "done" states are checked
  // with a controlled response in onboarding.spec.ts ONB-5.)
  await expect(page.getByTestId("onboarding-sync-job-league")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/l/${FIXTURE.leagueId}$`), { timeout: 30_000 });
  await expect(page.getByTestId("home-page")).toBeVisible();
  // All three first-sync jobs finished after the league was chosen.
  const res = await page.request.get(`${onboardingBaseUrl}/api/sync/status`);
  const status = SyncStatus.parse(await res.json());
  for (const name of ["league", "users", "rosters"]) {
    expect(status.jobs.find((j) => j.job === name)?.lastRun?.status, name).toBe("success");
  }
});

test("ONB-F2: once set up, /onboarding shows the done view with a link to Home", async ({
  page,
}) => {
  await page.goto(`${onboardingBaseUrl}/onboarding`);
  await expect(page.getByTestId("onboarding-done")).toBeVisible();
  await expect(page.getByTestId("onboarding-go-home")).toHaveAttribute(
    "href",
    `/l/${FIXTURE.leagueId}`,
  );
  await page.goto(`${onboardingBaseUrl}/`);
  await expect(page).toHaveURL(new RegExp(`/l/${FIXTURE.leagueId}$`));
});
