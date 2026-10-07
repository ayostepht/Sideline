# Gate G7b: Phase 7b selective (Auto lineup, trades, weather)
Date: 2026-10-07 | Branch: `phase/7b-selective` | Commit: `b499617`
RESULT: PASS (third run; mini-gate per ADR-022 item 11, combined for all three features)

## Universal and UI checks (`pnpm gate`)
| Check | Result | Evidence |
|---|---|---|
| U1 verify (typecheck, lint, format, unit) | PASS | 1817 tests |
| U2a coverage thresholds | PASS | lines 96.07%, statements 94.3%, branches 86.69%, functions 95.42% |
| U2b integration | PASS | 31/31 |
| U3a production build and route JS budget | PASS | all routes under 204,800 B |
| U3b Docker image builds, starts, serves /api/health | PASS | |
| U3c linux/amd64 image | SKIPPED | default; CI builds multi-arch on push |
| U4 static scan | PASS | no skip/only/any/lint-disable |
| UI1 e2e, all projects (incl. UI5) | PASS | 548 passed |
| UI2 axe light and dark | PASS | 552 passed |
| UI3 Lighthouse mobile budgets | PASS | transferred script: Lineup 193,128, Waivers 191,337, Players 190,150 B (before P7b.G2: 212,925 / 212,498 / 206,465) |
| UI4 screenshots 390/768/1280 light and dark | PASS | Trades included; clock pinned |
| Privacy (`pnpm fixtures:check`) | PASS | no identifiers; ADR-018 exemption exact-segment only |

## Runs
1. FAIL (5): U2b weather job without an MSW handler; UI1/UI2 because the gate's own server did not pin `SIDELINE_GAME_CLOCK`; UI4 Trades prefetch hang; UI3 transferred script over budget (lazy chunks loaded right after hydration). Fixed in `02c1f2d`, `0b6a286`, `cf2c583`.
2. FAIL (2): 18 popover/sheet tests, a regression from `cf2c583` (placeholder lacked popup semantics; `?open=why` never loaded). Fixed in `b499617`.
3. PASS.

## Requirements trace
- AUTO-1: `apps/web/lib/server/lineup.test.ts`, `lineup/_components/mode-toggle.test.tsx`, `e2e/weather.spec.ts` (AUTO-1a/1b), `e2e/lineup.spec.ts`
- TRADE-1..4: `packages/core/src/trade/*.test.ts`, `finder.perf.test.ts`, `apps/web/lib/server/trades.test.ts`, `trades.perf.test.ts`, `e2e/trades.spec.ts`
- TRADE-5: `apps/web/lib/client/nav.test.ts`, `e2e/nav.spec.ts`, `e2e/trades.spec.ts`
- WX-1..3: `packages/providers/src/weather.test.ts`, `apps/worker/src/jobs/weather-job.test.ts`, `packages/db/src/weather.test.ts`, `apps/worker/src/cli/seed-fixtures.test.ts`
- WX-4, WX-5: `apps/web/lib/server/weather.test.ts` (incl. context-only test), `apps/web/components/weather.test.tsx`, `e2e/weather.spec.ts`

## Reviews
Code: `docs/reviews/2026-10-07-p7b-batch12-code.md` (approve), `-batch3-code.md` (2 Major, fixed), `-batch4-code.md` (approve), `-batch5-code.md` (3 Major, fixed). UX: `-batch4-ux.md` (3 Major, fixed), `-batch4-ux-recheck.md` (approve), `-batch5-ux.md` (approve). All Minor items are in the PROGRESS backlog.

## Decisions during the phase
ADR-022 item 7a (finder excludes Lopsided, ranks by the smaller gain; Steph may overrule). Lineup loads WhySheet eagerly (blank-404 race with the lazy one; root cause unknown). Popovers and sheets load on first intent.

## Known issues carried forward
See PROGRESS "Found during Phase 7b": weather chip icon from label text; lazy WhySheet race root cause; soft navigation before hydration wipes `<head>` (Trades works around it); cold Finder about 0.8 s, dominated by 10 playoff sims; review minors.

## Human checkpoint
Release approval for v1.3.0 (merge to `main`, tag, push so CI publishes the image).
