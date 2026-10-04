import { expect, test, type Cookie, type Page, type TestInfo } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./helpers/axe";
import { L } from "./helpers/data";
import { AUTH_PASSWORD, authBaseUrl, FIXTURE } from "./helpers/servers";

/**
 * HOST-8 (T6.1/T6.1c): the optional APP_PASSWORD login gate, end to end. Runs only against
 * `authBaseUrl` (see playwright.config.ts and helpers/servers.ts): the main and onboarding
 * servers both run with no password configured, so this is the only server where the gate is
 * actually on. Previously untested gap, logged in docs/PROGRESS.md's backlog ("T6.1c follow-up:
 * no e2e coverage yet for the login/logout round trip").
 *
 * Every test navigates with an absolute URL (authBaseUrl), never a bare path: the global
 * `baseURL` in playwright.config.ts points at the unrelated seeded server on port 3000.
 *
 * Rate-limit note: `isRateLimited` (apps/web/lib/server/auth.ts) keys its 5-attempts-per-minute
 * window on `clientIp`, which falls back to a single constant "direct" bucket for any request
 * with no X-Forwarded-For header -- which is every request this spec makes, run across 3
 * Playwright projects in parallel. Without `withUniqueClientIp` below, the handful of real
 * login POSTs across all three projects would land in that one shared bucket and could legitimately
 * exceed 5 within the window, failing a correct-password test with a false "rate limited" 401 --
 * not a bug in the app, but a real risk of this spec's own design, since this app also documents
 * (HOST-7) trusting the last X-Forwarded-For hop from exactly one reverse proxy. Each test
 * therefore simulates a distinct upstream client IP, matching that documented trust model and
 * giving every test (and every project) its own independent rate-limit bucket.
 */
async function withUniqueClientIp(page: Page, testInfo: TestInfo): Promise<void> {
  const ip = `e2e-${testInfo.testId}`;
  await page.route("**/api/login", async (route) => {
    await route.continue({ headers: { ...route.request().headers(), "x-forwarded-for": ip } });
  });
}

async function login(page: Page, password: string): Promise<void> {
  await page.goto(`${authBaseUrl}/login`);
  await page.getByTestId("login-password-input").fill(password);
  await page.getByTestId("login-submit").click();
}

function sessionCookie(cookies: Cookie[]): Cookie | undefined {
  return cookies.find((c) => c.name === "sideline_session");
}

test.describe("HOST-8: login/logout", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await withUniqueClientIp(page, testInfo);
  });

  test("HOST-8: wrong password shows an error and does not grant access", async ({ page }) => {
    await login(page, "definitely-the-wrong-password");

    const error = page.getByTestId("login-error");
    await expect(error).toBeVisible();
    await expect(error).toHaveText(/incorrect/i);
    await expect(page).toHaveURL(`${authBaseUrl}/login`);
    expect(sessionCookie(await page.context().cookies())).toBeUndefined();

    // The error state is a new visible state (role="alert", negative-color text) not covered by
    // routes.spec.ts's axe check of /login's default (no-error) render on the other server.
    await expectNoSeriousA11yViolations(page);

    // Still no access to a protected route.
    await page.goto(`${authBaseUrl}${L}`);
    await expect(page).toHaveURL(`${authBaseUrl}/login`);
  });

  test("HOST-8: correct password redirects to Home; the session cookie grants subsequent access", async ({
    page,
  }) => {
    await login(page, AUTH_PASSWORD);

    // LoginForm calls `router.replace("/")`, but `/` (app/page.tsx) itself is a server-side
    // `redirect()` to the active league's Home (`/l/{leagueId}`) -- so the real, stable landing
    // URL is Home, not the bare "/". Asserting "/" directly is a genuine race: Next's client
    // router can resolve the server redirect fast enough that the address bar never observably
    // shows "/" during Playwright's polling window, intermittently failing this assertion
    // (reproduced on mobile-iphone/WebKit under load, in the full suite but not in isolation).
    await expect(page).toHaveURL(`${authBaseUrl}${L}`);
    await expect(page.getByTestId("home-page")).toBeVisible();
    const cookie = sessionCookie(await page.context().cookies());
    expect(cookie, "a signed session cookie was set on successful login").toBeDefined();
    expect(cookie?.httpOnly).toBe(true);

    // Subsequent requests succeed with the session cookie: a protected page loads directly, no
    // redirect back to /login.
    await page.goto(`${authBaseUrl}${L}`);
    await expect(page).toHaveURL(`${authBaseUrl}${L}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("HOST-8: logout clears the session; protected routes redirect to /login afterward", async ({
    page,
  }) => {
    await login(page, AUTH_PASSWORD);
    // See the matching comment above: the real landing URL is Home (`/l/{leagueId}`), not "/".
    await expect(page).toHaveURL(`${authBaseUrl}${L}`);
    await expect(page.getByTestId("home-page")).toBeVisible();

    await page.goto(`${authBaseUrl}${L}/settings`);
    const logoutButton = page.getByTestId("settings-logout");
    await expect(logoutButton).toBeVisible();
    await logoutButton.click();

    await expect(page).toHaveURL(`${authBaseUrl}/login`);
    expect(sessionCookie(await page.context().cookies())).toBeUndefined();

    // A fresh navigation to a protected route after logout redirects to /login again.
    await page.goto(`${authBaseUrl}${L}`);
    await expect(page).toHaveURL(`${authBaseUrl}/login`);
  });

  test("HOST-8: a protected route with no session redirects to /login", async ({ page }) => {
    // A fresh context (default per test, no prior login in this test) with no session cookie.
    await page.goto(`${authBaseUrl}${L}`);
    await expect(page).toHaveURL(`${authBaseUrl}/login`);
  });

  test("HOST-8: a protected API route with no session returns 401 JSON, not a redirect", async ({
    request,
  }) => {
    const res = await request.get(`${authBaseUrl}/api/l/${FIXTURE.leagueId}/lineup`);
    expect(res.status()).toBe(401);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("unauthorized");
  });

  test("HOST-8: /api/health stays reachable with no session even though APP_PASSWORD is configured", async ({
    request,
  }) => {
    const res = await request.get(`${authBaseUrl}/api/health`);
    expect(res.status()).toBe(200);
  });
});
