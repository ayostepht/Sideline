import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./helpers/axe";
import { expectNoHorizontalScroll, PHONE_WIDTH } from "./helpers/no-hscroll";
import { themes } from "./helpers/theme";

/**
 * Smoke tests against the running app (production build). Add new routes to `routes` below so
 * every route gets the axe check (both themes) and the no-horizontal-scroll check at 390px.
 */
const routes = ["/"];

test("HOST-3: GET /api/health returns 200 with status ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { status?: unknown };
  expect(body.status).toBe("ok");
});

for (const route of routes) {
  test.describe(`route ${route}`, () => {
    for (const theme of themes) {
      test(`UI2: ${route} has no serious axe violations (${theme})`, async ({ page }) => {
        const response = await page.goto(route);
        expect(response?.ok()).toBe(true);
        await expectNoSeriousA11yViolations(page, { theme });
      });
    }

    test(`UI5: ${route} has no horizontal scroll at ${PHONE_WIDTH}px`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.ok()).toBe(true);
      await expectNoHorizontalScroll(page, { width: PHONE_WIDTH });
    });
  });
}
