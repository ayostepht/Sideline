import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./helpers/axe";
import { expectNoHorizontalScroll, PHONE_WIDTH } from "./helpers/no-hscroll";
import { expectThemeApplied, themes, useTheme } from "./helpers/theme";
import { DATA, L } from "./helpers/data";
import { notFoundRoutes } from "./routes";

/**
 * Every test here loads a page that ends in an unguarded `notFound()` (ADR-009 item 18: a real
 * 404 status needs no Suspense boundary above it). Next.js 16 streams such pages with an empty
 * <head> and defers the app stylesheet to hydration; under heavy parallel load that CSS request
 * can abort and the page stays blank until React's 60 s stylesheet timeout (root cause: PROGRESS
 * backlog "TEAM-3 flaky e2e test"). Steph's G2 decision, option c (ADR-012): run these tests
 * alone, not weakened. playwright.config.ts runs this file only in the `*-notfound` projects,
 * which depend on the whole main suite finishing and run one after another, one worker each.
 * Every assertion is unchanged from where it lived before (pages.spec.ts, routes.spec.ts).
 */
test.describe.configure({ mode: "serial" });

test.describe("Not-found pages (PLAN 6.5, ADR-009 item 2)", () => {
  test("TEAM-3: an unknown roster id shows the not-found page", async ({ page }) => {
    const res = await page.goto(`${L}/league/teams/9999`);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "We could not find that page" })).toBeVisible();
    await expect(page.getByTestId("team-view")).toHaveCount(0);
  });

  test("MYTEAM-3: My Team for an unknown league shows the not-found page (no soft 404)", async ({
    page,
  }) => {
    const res = await page.goto(`/l/${DATA.unknownLeagueId}/team`);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "We could not find that page" })).toBeVisible();
    await expect(page.getByTestId("team-view")).toHaveCount(0);
  });

  test("STATE-1: unknown league shows not-found with a working link", async ({ page }) => {
    const res = await page.goto(`/l/${DATA.unknownLeagueId}`);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "We could not find that page" })).toBeVisible();
    await page.getByRole("link", { name: "Go home" }).click();
    await expect(page).toHaveURL(new RegExp(`${L}$`));
    await expect(page.getByTestId("home-page")).toBeVisible();
  });
});

for (const route of notFoundRoutes) {
  test.describe(`not-found route ${route}`, () => {
    for (const theme of themes) {
      test(`UI2: ${route} has no serious axe violations (${theme})`, async ({ page }) => {
        await useTheme(page, theme);
        const response = await page.goto(route);
        expect(response?.status()).toBe(404);
        await expectThemeApplied(page, theme);
        await expectNoSeriousA11yViolations(page, { theme });
      });
    }

    test(`UI5: ${route} has no horizontal scroll at ${PHONE_WIDTH}px`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBe(404);
      await expectNoHorizontalScroll(page, { width: PHONE_WIDTH });
    });
  });
}
