import { expect, test } from "@playwright/test";

/**
 * Smoke tests against the running app (production build). Routes for axe and no-hscroll live in
 * e2e/routes.ts and run from e2e/routes.spec.ts.
 */

// The primary e2e server has a seeded DATA_DIR and no worker, which ADR-005 item 6 defines
// as 200 "degraded" with a working DB.
test("HOST-3: GET /api/health returns 200, degraded on a seeded DATA_DIR without a worker", async ({
  request,
}) => {
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
