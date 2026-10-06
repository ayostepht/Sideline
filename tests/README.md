# Tests

Owner: qa-engineer. Application unit tests are co-located (`*.test.ts` next to the code);
everything here is cross-cutting.

## Policy

- Retries are 0 everywhere (Vitest `retry: 0`, Playwright `retries: 0` including CI). A flaky
  test is a bug: find the cause. No `.skip`, no `.only` (Playwright `forbidOnly` is on), no
  arbitrary sleeps, no loosened assertions to get green.
- Name tests with requirement IDs, e.g. `LINEUP-3: locked starter is never moved`.
- No network in default runs. Only `pnpm test:contract` may call the live Sleeper API.

## Suites

| Suite                       | Command                                  | Notes                                                                                          |
| --------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Unit and harness self-tests | `pnpm test:unit` (part of `pnpm verify`) | Vitest projects per package, plus `harness`, `scripts` and `optimizer-suites` (below)          |
| Coverage                    | `pnpm test:coverage`                     | Thresholds in `vitest.config.ts` match PLAN.md 10.5 (see Coverage)                             |
| Integration                 | `pnpm test:integration`                  | Vitest project `integration`: MSW + temp SQLite, `tests/integration/`                          |
| E2E                         | `pnpm test:e2e`                          | Playwright, 3 projects, builds and starts the server unless `E2E_BASE_URL` is set              |
| Accessibility               | `pnpm test:a11y`                         | Axe checks (the same specs, see below)                                                         |
| Lighthouse                  | `pnpm lhci`                              | Needs `pnpm build` first and a seeded `E2E_DATA_DIR`; lhci starts the standalone server itself |
| Contract                    | `pnpm test:contract`                     | Vitest project `contract`: live Sleeper, schema only, manual                                   |

The default `vitest run` projects:

- Per package: `web`, `worker`, `shared`, `sleeper`, `providers`, `db`, `core` (co-located `*.test.ts`).
- `harness`: `tests/harness/` (self-tests for the MSW handlers).
- `scripts`: `scripts/**/*.test.ts` (fixture recorder, gate, seed, server helpers).
- `optimizer-suites`: `tests/golden/` (`optimizer.golden.test.ts`, `priority-advisor.golden.test.ts`)
  and `tests/property/` (`optimizer.property.test.ts`, fast-check). Pure and in memory.

Other directories under `tests/`: `integration/`, `contract/`, `msw/` (fixture handlers),
`helpers/` (shared test helpers), `fixtures/`. `*perf.test.ts` files assert wall-clock budgets
and run in `pnpm test:unit` but are excluded from `--coverage` runs (V8 instrumentation
inflates their timings).

### Playwright

Config: `playwright.config.ts`. Projects: `desktop-chromium` (1280x800), `mobile-iphone`
(WebKit, iPhone 13, 390 wide), `mobile-pixel` (Chromium, Pixel 7). `e2e/not-found.spec.ts` runs
only in the `*-notfound` projects (`desktop-chromium-notfound`, `mobile-iphone-notfound`,
`mobile-pixel-notfound`), one at a time after the main projects finish.

Specs in `e2e/`: `smoke`, `routes` (axe and no-hscroll for every route), `nav`, `pages`,
`settings`, `search`, `onboarding`, `onboarding-flow`, `auth`, `lineup`, `matchup`, `league`,
`waivers`, `players`, `not-found`, and `helpers` (self-test). First time on a machine:
`pnpm exec playwright install chromium webkit`.

- `E2E_BASE_URL=http://host:port` tests an already running server; nothing is started.
- Without it, the config builds and starts the production standalone server (the one Docker
  ships, `pnpm --filter @sideline/web start:standalone`) on 127.0.0.1:3000
  (`reuseExistingServer: false`, so a stale server on the port is an error, not silently tested; 180 s timeout) with `SIDELINE_GALLERY=1` and `DATA_DIR` set to a fixture-seeded temp dir (`createSeededDataDir`, `pnpm db:seed:fixtures`). `E2E_DATA_DIR` overrides but must be seeded (marker file) and outside `./data`, or the config refuses. `E2E_SKIP_SERVER=1` never starts one. `E2E_ONBOARDING_DATA_DIR` and `E2E_AUTH_DATA_DIR` override the other two data dirs.
- Three servers: the seeded one (port 3000, league `1000000000000000001` exists, no worker), an onboarding
  server (port 3101, fresh unseeded DATA_DIR, fixture-mode worker alongside, no network), and an auth
  server (port 3102, a second fixture-seeded DATA_DIR, started with `APP_PASSWORD`/`SESSION_SECRET` set so
  HOST-8's login gate is actually on, used only by `e2e/auth.spec.ts`). URLs and fixture ids are in
  `e2e/helpers/servers.ts` (`seededBaseUrl`, `onboardingBaseUrl`, `authBaseUrl`, `AUTH_PASSWORD`, `FIXTURE`).
  The onboarding and auth servers also start next to an external `E2E_BASE_URL` server.
  Onboarding state is shared across the run, so specs that change it run serially. Neither the onboarding
  nor the auth server builds; with `E2E_BASE_URL` set a build must already exist.
- Routes for axe (UI2) and no-hscroll (UI5) live in `e2e/routes.ts` (`existingRoutes` covers every page (including lineup, matchup, waivers and players), `/login`, the
  onboarding done view and the gallery; `notFoundRoutes` must answer 404). Themes: `useTheme(page, theme)` before `goto`, then `expectThemeApplied`.
- `e2e/helpers.spec.ts` is the helpers' own self-test (uses `page.setContent`, needs no app, so
  the server is not started when it is the only spec named on the command line).
- Failure artifacts: trace and screenshot are kept on failure (`test-results/`, `playwright-report/`).

### Helpers (`e2e/helpers/`)

- `expectNoSeriousA11yViolations(page, { theme?, include? })`: axe with WCAG 2.1 A/AA tags;
  fails on serious or critical impact with a readable list of rules and nodes (UI2).
- `expectNoHorizontalScroll(page, { width? })`: UI5. Compares `scrollWidth` to
  `clientWidth` rather than `window.innerWidth`, because mobile Chromium inflates `innerWidth`
  to fit overflowing content (a 1000px element passes the naive check on Pixel 7). Use
  `{ width: 390 }` to check at the phone width on every project.
- `setTheme(page, "light" | "dark")`: emulates `prefers-color-scheme`. `useTheme(page, theme)` and
  `expectThemeApplied(page, theme)` apply and check the theme in the app; `themes` lists both.
- `settleAnimations(page)` (`settle.ts`), `L` and `DATA` (`data.ts`, fixture league path and ids),
  and the server URLs (`servers.ts`).

### Adding a route to e2e, axe and Lighthouse

1. e2e: add the path to `existingRoutes` in `e2e/routes.ts`. `e2e/routes.spec.ts` then gives it axe
   (light and dark) and the 390px no-horizontal-scroll check on all three projects. Flow tests get their
   own `e2e/<feature>.spec.ts`; use role and `data-testid` locators.
2. Lighthouse: add the full URL to `ci.collect.url` in `lighthouserc.json`
   (e.g. `http://127.0.0.1:3000/lineup`). JSON has no comments, so this README is the doc.
3. Run `pnpm build && pnpm lhci`. `pnpm lhci` does not build; it starts the standalone server
   itself (`startServerCommand`, ready when the log shows "Ready in") and needs the existing
   build. Budgets (PLAN.md 6.6, error level, median run of 3, mobile emulation which is the
   Lighthouse default): performance >= 0.85, accessibility >= 0.95, best-practices >= 0.95.
   Units: `resource-summary:script:size` is in bytes (204800 = 200 KB); category scores are 0 to 1
   (0.85 = 85). Lighthouse needs Chrome (`CHROME_PATH` if it is not auto-detected).

### Route JS budget (200 KB gzipped, PLAN.md 6.6)

Asserted per URL in `lighthouserc.json` as `resource-summary:script:size` (error,
`maxNumericValue` 204800 bytes). Lighthouse reports transfer size, which is the compressed
size on the wire, so this is the "200 KB gzipped" budget. The server must compress responses
for this to be meaningful (the Next standalone server does by default). `pnpm gate` also checks
route JS sizes from the build output (`scripts/gate/routes-size.ts`).

## Integration and contract projects

`integration` and `contract` are Vitest projects registered in `vitest.config.ts` only when named
with `--project`, so `pnpm test:unit` and `pnpm verify` never run them.

- Integration: `vitest run --project integration`. Helpers in `tests/helpers/`:
  `createTempDb()` (fresh migrated SQLite in an OS temp `DATA_DIR`; call `cleanup()` in
  `afterEach`/`afterAll`), `synthetic2025Root` and `readFixtureJson`, `readEnvValue` (`env.ts`), and
  the sync harness (`sync-harness.ts`: fake clock and limiter, nflverse mock, `createSyncHarness`),
  plus the MSW server below. Files: `harness`, `sync-full`, `sync-failures`, `sync-rate`,
  `sync-nflverse`, `sync-single-caller`, `sim-league-wired`, `sim-league-perf`, `web-read-perf`
  (all `tests/integration/*.test.ts`).
  Import workspace code by relative path (`../../packages/db/src/index.js`); the root has no
  `@sideline/*` deps.
- Contract: `vitest run --project contract`. Live Sleeper, shapes only (no value assertions, no
  files written, nothing logged). Reads `DEFAULT_LEAGUE_ID` from the environment or the gitignored
  `.env`; the run FAILS with a clear message when it is absent (no skips). Calls the live API with
  plain fetch (not the shared limiter), about 20 calls. `/players/nfl` (CONTRACT-3, in
  `players.contract.test.ts`) is excluded by default (the default run is
  `sleeper.contract.test.ts` only); run `CONTRACT_PLAYERS=1 pnpm test:contract`
  to include it (at most once a day). Manual or gate-only, never part of CI.

## Coverage

Run `pnpm test:coverage` for the whole repo. Thresholds (lines unless noted): `packages/core` 90
(branches 85), `packages/sleeper` 85, `packages/providers` 85, `packages/db` 75,
`apps/web/lib/server` 75, `apps/web/app/api` 75, `apps/worker` 75. Coverage globs are repo-relative, so a per-project
`--coverage --project X` run reports `Unknown%`; thresholds are only meaningful on the whole run.

## MSW fixture handlers

`tests/msw/sleeper-handlers.ts` and `tests/msw/server.ts`; layout and sanitization rules in
`tests/fixtures/README.md`.

```ts
const server = createSleeperServer({ fixtureRoot: syntheticFixtureRoot });
beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  server.mock.reset();
});
afterAll(() => server.close());

server.use(withStatus("/v1/state/nfl", 429, 1, { headers: { "Retry-After": "2" } }));
server.use(withDelay("/v1/league/:id", 500, 1));
expect(server.mock.unhandled).toEqual([]);
```

`withStatus(path, status, times?)` answers with the status for the first `times` calls (default
all), then falls through to the fixtures, so retry and recovery logic can be tested. Requests to
any other host fail loudly.

### Lighthouse locally

`pnpm lhci` needs a seeded `E2E_DATA_DIR` (it fails clearly if unset) and a build. `pnpm gate` seeds
the dir for its Lighthouse step (check UI3). By hand:

```
pnpm build
export E2E_DATA_DIR=$(pnpm exec tsx -e 'import("./scripts/lib/seed.ts").then(async (m) => console.log((await m.createSeededDataDir(process.cwd())).dataDir))' | tail -1)
pnpm lhci
```

`lighthouserc.json` audits six pages of league `1000000000000000001`: Home, `/league`, `/lineup`,
`/matchup`, `/waivers` and `/players`. The gate script is `pnpm gate` (`scripts/gate.ts`); `pnpm gate:soak`
runs `scripts/gate/soak.ts`.

## Phase 2 requirements trace (gate G2)

Seeded server = fixture-seeded DATA_DIR with the fixture user stored (manager_04), active league
`1000000000000000001`, no worker. Onboarding server = fresh DATA_DIR plus the fixture worker.
`onboarding-flow.spec.ts` runs on desktop-chromium only (shared one-way state); everything else runs on all three projects.

| G2 item                                          | Spec and test IDs                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PLAN 3.4 freshness (stale and preseason states)  | Fresh state only: `HOME-1`, `TEAM-1` (freshness label renders). Stale and preseason need a changed clock or `nfl_state`; fixtures are mid-season (week 4) and fresh, and the app must not fake data, so these are covered by unit tests in `apps/web` (`views.test.ts`, component tests), not e2e. |
| 6.2 gallery                                      | `e2e/smoke.spec.ts`, `e2e/routes.spec.ts` (`/dev/gallery` and overlays: UI2, UI5)                                                                                                                                                                                                                  |
| 6.3 navigation                                   | `e2e/nav.spec.ts`: `NAV-1` sidebar, `NAV-2` tabs and More, `NAV-3`/`NAV-4` week selector, `NAV-5` explicit `?week=`, `NAV-6`/`NAV-7` league switcher                                                                                                                                               |
| 6.4 onboarding                                   | `e2e/onboarding.spec.ts`: `ONB-1` validation, `ONB-2` done view, `ONB-3` picker, `ONB-4` worker offline, `ONB-5` sync progress. `e2e/onboarding-flow.spec.ts`: `HOST-3`, `ONB-F1` full flow, `ONB-F2`                                                                                              |
| 6.4 Home v1                                      | `e2e/pages.spec.ts`: `HOME-1`, `HOME-1b`, `HOME-2`, `HOME-3`                                                                                                                                                                                                                                       |
| 6.4 League                                       | `LEAGUE-1` (table or cards, one You row), `LEAGUE-2` (roster links on desktop, standings cards on mobile)                                                                                                                                                                                          |
| 6.4 Team detail                                  | `TEAM-1`, `TEAM-2` (`?highlight=`, Search result tag), `TEAM-3` (404 status), `STATE-3` (placeholder next actions), `NAV-2b` (More sheet current item), `NAV-3b` (week double-click)                                                                                                               |
| 6.4 My Team                                      | `MYTEAM-1`, `MYTEAM-2`                                                                                                                                                                                                                                                                             |
| 6.4 Settings v1                                  | `e2e/settings.spec.ts`: `SET-1`..`SET-4`                                                                                                                                                                                                                                                           |
| 6.5 states                                       | `STATE-1` not found, `STATE-2` section stubs, `ONB-4` offline, `ONB-5` loading progress                                                                                                                                                                                                            |
| 6.6 accessibility and layout                     | `e2e/routes.spec.ts` `UI2:` (axe, light and dark) and `UI5:` (no horizontal scroll at 390px) for every route in `e2e/routes.ts`                                                                                                                                                                    |
| 6.6 Lighthouse (UI3)                             | `pnpm lhci`: the six URLs in `lighthouserc.json`                                                                                                                                                                                                                                                   |
| 6.6 read performance                             | `tests/integration/web-read-perf.integration.test.ts` `PERF-1`                                                                                                                                                                                                                                     |
| ADR-009 item 2 (root redirect, not found)        | `HOME-3`, `STATE-1`                                                                                                                                                                                                                                                                                |
| ADR-009 item 3 (league switch keeps the section) | `NAV-6` (POST answered by the test, see the spec comment)                                                                                                                                                                                                                                          |
| ADR-009 item 11 (player search)                  | `e2e/search.spec.ts`: `SEARCH-1`..`SEARCH-6`                                                                                                                                                                                                                                                       |
| ADR-009 item 14 (settings, sync now)             | `SET-3` (summary, collapsed jobs, cooldown)                                                                                                                                                                                                                                                        |
| ADR-009 item 16 (first-run sync progress)        | `ONB-5`, `ONB-F1`                                                                                                                                                                                                                                                                                  |
