import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./helpers/axe";
import { expectNoHorizontalScroll, PHONE_WIDTH } from "./helpers/no-hscroll";
import { themes } from "./helpers/theme";

/**
 * Smoke tests against the running app (production build). Add new routes to `routes` below so
 * every route gets the axe check (both themes) and the no-horizontal-scroll check at 390px.
 */
const routes = ["/"];

// The e2e server runs on a fresh, unmigrated DATA_DIR with no worker, which ADR-005 item 6 defines
// as 200 "degraded" with a working DB.
test("HOST-3: GET /api/health returns 200, degraded on an empty DATA_DIR", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    status?: unknown;
    db?: { ok?: unknown };
    worker?: { status?: unknown };
  };
  expect(body.status).toBe("degraded");
  expect(body.db?.ok).toBe(true);
  expect(body.worker?.status).toBe("never");
});

test("HOST-3: / references /_next/static assets and they are served (standalone asset layout)", async ({
  page,
  request,
}) => {
  const res = await request.get("/");
  expect(res.status()).toBe(200);
  const html = await res.text();
  const assets = [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1]);
  expect(assets.length).toBeGreaterThan(0);
  for (const asset of assets as string[]) {
    const assetRes = await request.get(asset);
    expect(assetRes.status(), asset).toBe(200);
  }
  // The page must also load them in a browser (goto waits for the load event) without failures.
  const failed: string[] = [];
  page.on("response", (r) => {
    if (r.url().includes("/_next/static/") && !r.ok()) failed.push(`${r.status()} ${r.url()}`);
  });
  await page.goto("/");
  expect(failed).toEqual([]);
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
