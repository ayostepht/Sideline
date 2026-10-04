# Code review: Phase 5 Batch E (T5.6)

Date: 2026-10-03
Scope: `git show 1b8cdc8` on `phase/5-matchups` -- `tests/integration/sim-league-wired.integration.test.ts`, `tests/integration/sim-league-perf.integration.test.ts`, `e2e/matchup.spec.ts`, `e2e/league.spec.ts`, `e2e/pages.spec.ts` (STATE-3 removed).

## Verdict

APPROVE. One trivial Minor fixed directly by the orchestrator (`41599d0`, a comment's stated headroom corrected from "6x" to "5x" to match measured numbers); one Nit needs no action (a deliberately duplicated `deriveSeed` in a black-box integration test, already self-documenting).

## What the reviewer verified independently (not just read the claims)

- Determinism/symmetry/playoff-odds-sum tests genuinely exercise the wired path (`getMatchup`/`getLeagueIntelligence` -> real SQLite -> `computed_cache` -> pure core functions), confirmed by reading `apps/web/lib/server/matchup.ts`'s `deriveSeed` and the cache-key scheme.
- The Brier-score calculation is a real computation, not a stub: re-ran it live, confirmed 0/100 starters have stored `proj_pts` for weeks 1-3, matching the fixture manifest's `partialWeeks=[4]`/`weeks=[1,2,3]` exactly -- a genuine data-gap finding.
- `STATE-3`'s removal is justified: `grep -rln "StubPage" apps/web/app` returns zero results, confirming the component is genuinely dead code reachable from no route.
- Perf budgets have real, stable headroom across three independent re-runs, not a near-miss that got lucky once.
- `e2e/matchup.spec.ts`/`league.spec.ts` assert real rendered content via `data-testid` selectors, following the existing `isDesktop`/responsive-view convention.
- Scope confirmed: all 5 files under `tests/` or `e2e/`, nothing in `apps/web/lib/server/`, `apps/web/app/`, or `packages/` touched. No `.skip`/`.only`/`any` anywhere in the diff.

## Checks run by the reviewer (independently)

- `pnpm vitest run --project integration` -- 9 files, 31 tests, run 3 times for stability
- `grep` for `StubPage` usage, `.skip`/`.only`, `any` -- all clean
- `eslint`/`tsc --noEmit` on all 5 changed files -- clean
- Full read of `matchup.ts`/`league-intelligence.ts`'s relevant sections to verify `deriveSeed` and cache-key logic
