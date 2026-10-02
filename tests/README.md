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

| Suite                       | Command                                  | Notes                                                                 |
| --------------------------- | ---------------------------------------- | --------------------------------------------------------------------- |
| Unit and harness self-tests | `pnpm test:unit` (part of `pnpm verify`) | Vitest projects per package plus `harness` (`tests/harness/`)         |
| Coverage                    | `pnpm test:coverage`                     | Thresholds in `vitest.config.ts` match PLAN.md 10.5                   |
| Integration                 | `pnpm test:integration`                  | Vitest project `integration`: MSW + temp SQLite, `tests/integration/` |
| E2E                         | `pnpm test:e2e`                          | Playwright, 3 projects, needs a production build                      |
| Accessibility               | `pnpm test:a11y`                         | Axe checks (the same specs, see below)                                |
| Lighthouse                  | `pnpm lhci`                              | Needs `pnpm build` first; lhci starts the standalone server itself    |
| Contract                    | `pnpm test:contract`                     | Vitest project `contract`: live Sleeper, schema only, manual          |

### Playwright

Config: `playwright.config.ts`. Projects: `desktop-chromium` (1280x800), `mobile-iphone`
(WebKit, iPhone 13, 390 wide), `mobile-pixel` (Chromium, Pixel 7). First time on a machine:
`pnpm exec playwright install chromium webkit`.

- `E2E_BASE_URL=http://host:port` tests an already running server; nothing is started.
- Without it, the config builds and starts the production standalone server (the one Docker
  ships, `pnpm --filter @sideline/web start:standalone`) on 127.0.0.1:3000
  (`reuseExistingServer: false`, so a stale server on the port is an error, not silently tested; 180 s timeout) with `DATA_DIR` set to a fresh temp dir (`E2E_DATA_DIR` overrides). `E2E_SKIP_SERVER=1` never
  starts one.
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
- `setTheme(page, "light" | "dark")`: emulates `prefers-color-scheme`.

### Adding a route to e2e, axe and Lighthouse

1. e2e: add the path to `routes` in `e2e/smoke.spec.ts`. Each route then gets axe (light and
   dark) and the 390px no-horizontal-scroll check on all three projects. Flow tests get their
   own `e2e/<feature>.spec.ts`; use role and `data-testid` locators.
2. Lighthouse: add the full URL to `ci.collect.url` in `lighthouserc.json`
   (e.g. `http://127.0.0.1:3000/lineup`). JSON has no comments, so this README is the doc.
3. Run `pnpm build && pnpm lhci`. `pnpm lhci` does not build; it starts the standalone server
   itself (`startServerCommand`, ready when the log shows "Ready in") and needs the existing
   build. Budgets (PLAN.md 6.6, error level, median of 3 runs, mobile emulation which is the
   Lighthouse default): performance >= 0.85, accessibility >= 0.95, best-practices >= 0.95.
   Units: `resource-summary:script:size` is in bytes (204800 = 200 KB); category scores are 0 to 1
   (0.85 = 85). Lighthouse needs Chrome (`CHROME_PATH` if it is not auto-detected).

### Route JS budget (200 KB gzipped, PLAN.md 6.6)

Asserted per URL in `lighthouserc.json` as `resource-summary:script:size` (error,
`maxNumericValue` 204800 bytes). Lighthouse reports transfer size, which is the compressed
size on the wire, so this is the "200 KB gzipped" budget. The server must compress responses
for this to be meaningful (the Next standalone server does by default). A build-time check of
first-load JS from `next build` output may still be added in the T0.5 gate script.

## Integration and contract projects

`integration` and `contract` are Vitest projects registered in `vitest.config.ts` only when named
with `--project`, so `pnpm test:unit` and `pnpm verify` never run them.

- Integration: `vitest run --project integration`. Helpers in `tests/helpers/`:
  `createTempDb()` (fresh migrated SQLite in an OS temp `DATA_DIR`; call `cleanup()` in
  `afterEach`/`afterAll`), `synthetic2025Root` and `readFixtureJson`, plus the MSW server above.
  Import workspace code by relative path (`../../packages/db/src/index.js`); the root has no
  `@sideline/*` deps.
- Contract: `vitest run --project contract`. Live Sleeper, shapes only (no value assertions, no
  files written, nothing logged). Reads `DEFAULT_LEAGUE_ID` from the environment or the gitignored
  `.env`; the run FAILS with a clear message when it is absent (no skips). Calls the live API with
  plain fetch (not the shared limiter), about 20 calls. `/players/nfl` (CONTRACT-3, in
  `players.contract.test.ts`) is excluded by default; run `CONTRACT_PLAYERS=1 pnpm test:contract`
  to include it (at most once a day). Manual or gate-only, never part of CI.

## Coverage

Run `pnpm test:coverage` for the whole repo. Coverage globs are repo-relative, so a per-project
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
