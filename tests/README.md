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

| Suite                       | Command                                  | Notes                                                              |
| --------------------------- | ---------------------------------------- | ------------------------------------------------------------------ |
| Unit and harness self-tests | `pnpm test:unit` (part of `pnpm verify`) | Vitest projects per package plus `harness` (`tests/harness/`)      |
| Coverage                    | `pnpm test:coverage`                     | Thresholds in `vitest.config.ts` match PLAN.md 10.5                |
| Integration                 | `pnpm test:integration`                  | MSW + temp SQLite, from T1.7. Project goes in `tests/integration/` |
| E2E                         | `pnpm test:e2e`                          | Playwright, 3 projects, needs a production build                   |
| Accessibility               | `pnpm test:a11y`                         | Axe checks (the same specs, see below)                             |
| Lighthouse                  | `pnpm lhci`                              | Needs `pnpm build` first; lhci starts the standalone server itself |
| Contract                    | `pnpm test:contract`                     | Live Sleeper, schema only, manual                                  |

### Playwright

Config: `playwright.config.ts`. Projects: `desktop-chromium` (1280x800), `mobile-iphone`
(WebKit, iPhone 13, 390 wide), `mobile-pixel` (Chromium, Pixel 7). First time on a machine:
`pnpm exec playwright install chromium webkit`.

- `E2E_BASE_URL=http://host:port` tests an already running server; nothing is started.
- Without it, the config builds and starts the production standalone server (the one Docker
  ships, `pnpm --filter @sideline/web start:standalone`) on 127.0.0.1:3000
  (`reuseExistingServer` locally, never in CI; 180 s timeout). `E2E_SKIP_SERVER=1` never
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
   Lighthouse needs Chrome (`CHROME_PATH` if it is not auto-detected).

### Route JS budget (200 KB gzipped, PLAN.md 6.6)

Asserted per URL in `lighthouserc.json` as `resource-summary:script:size` (error,
`maxNumericValue` 204800 bytes). Lighthouse reports transfer size, which is the compressed
size on the wire, so this is the "200 KB gzipped" budget. The server must compress responses
for this to be meaningful (the Next standalone server does by default). A build-time check of
first-load JS from `next build` output may still be added in the T0.5 gate script.

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
