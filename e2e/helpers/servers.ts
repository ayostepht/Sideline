/**
 * The two servers every e2e run can use (see playwright.config.ts).
 *
 * - `seededBaseUrl`: the default `baseURL` (`page.goto("/...")`, the `request` fixture). Its DATA_DIR
 *   is fixture-seeded: league `1000000000000000001` already exists and is active. No worker.
 * - `onboardingBaseUrl`: a second server on a fresh DATA_DIR where onboarding has NOT happened,
 *   with the fixture-mode worker running next to it. Use it with an absolute URL
 *   (`page.goto(`${onboardingBaseUrl}/onboarding`)`) or `request.get(`${onboardingBaseUrl}/api/...`)`.
 *   State is shared by every test (and every project) in the run: tests that change it must not
 *   assume a clean start, and should run serially (`test.describe.configure({ mode: "serial" })`).
 */
const HOST = "127.0.0.1";

export const seededBaseUrl = process.env["E2E_BASE_URL"] ?? `http://${HOST}:3000`;
export const onboardingBaseUrl = process.env["E2E_ONBOARDING_URL"] ?? `http://${HOST}:3101`;

/** Fixture identifiers (tests/fixtures/README.md). All fake. */
export const FIXTURE = {
  username: "manager_04",
  userId: "100000000000000004",
  leagueId: "1000000000000000001",
  syntheticLeagueId: "1000000000000000999",
  season: 2026,
} as const;
