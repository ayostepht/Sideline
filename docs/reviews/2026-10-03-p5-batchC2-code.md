# Code review: Phase 5 Batch C2 (T5.4b, T5.4d)

Date: 2026-10-03
Scope: `git diff 8995e67..76b68e5` on `phase/5-matchups` -- `apps/web/lib/server/roster-strength.ts` (T5.4d, `3ef1dad`) and `apps/web/lib/server/matchup.ts` plus its API wiring (T5.4b, `76b68e5`). Confirmed file-disjoint, no collision between the two parallel tasks.

## Verdict

CHANGES REQUIRED (one Major; fixed same-session before T5.4c started). See `docs/PROGRESS.md` backlog for the two lower-severity findings carried forward.

## Findings

| Severity | File | Finding | Status |
|---|---|---|---|
| Major (M1) | `apps/web/lib/server/matchup.ts` (`buildStarter`) | No bye-week handling: a starter on a bye this week got `not_started` with sd from pre-bye history, producing a spurious nonzero simulated score and a nonzero `swingPlayers` contribution for a player mathematically guaranteed to score 0. No test for a byed starter existed. | Fixed, see fix-round report below. |
| Minor (m1) | `apps/web/lib/server/roster-strength.test.ts` | Cache-invalidation test forces a `"rosters"` sync success after mutating `league_player_week_points` (conceptually a projections change) instead of a `"projections"` success. The hash-invalidation mechanism still passes (any of the four hashed jobs invalidates), but the test doesn't exercise the job that would realistically fire after new projections land, unlike `matchup.test.ts`'s equivalent test which pairs the mutation with the matching job. | Backlog (`docs/PROGRESS.md`, Phase 5 section). |
| Nit (n1) | `apps/web/lib/server/matchup.ts`, `roster-strength.ts` | Both return a cached response's `freshness` as computed at cache-write time, not recomputed against current `now` on a cache hit -- can under-report staleness within the same `inputsHash` window. Exact repeat of `lineup.ts`'s existing, presumably-accepted pattern; not a new regression. | Backlog (`docs/PROGRESS.md`, Phase 5 section), lowest priority. |

## Requirements coverage

PROJ-4, LEAGUE-3/4 inputs (T5.4d) and SIM-1/2 (T5.4b) all implemented and traced to real `packages/core` functions, verified by the reviewer reading `recommend.ts`, `rest-of-season.ts`, `variance.ts`, `sim/matchup.ts`, `sim/rng.ts`, and the worker's `league-points.ts` recompute hook directly (not just trusting subagent reports). `lineup.ts`'s four newly-exported functions confirmed byte-for-byte behavior-unchanged.

## Checks run by the reviewer (independently)

- `pnpm verify` (whole repo) -- 131 files, 1326 tests, all clean
- `pnpm --filter @sideline/web typecheck` -- clean
- grep for `.skip`/`.only`, `any`, unguarded non-null assertions -- none found
- Manual trace of `recommendLineup`'s `currentAssignment: all-null` handling, `computed_cache`'s upsert semantics, and the "finished" signal's provenance through the worker's recompute hook
