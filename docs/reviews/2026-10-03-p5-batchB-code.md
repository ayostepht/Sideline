# Code review: Phase 5 Batch B (T5.3)

Date: 2026-10-03
Scope: `git diff 2ce52e9~1..2ce52e9` on `phase/5-matchups` -- `packages/core/src/league/playoff-odds.ts`, its test, and one additive line in `packages/core/src/league/index.ts`.

## Verdict

CHANGES REQUIRED (one Major; fixed same-session before Batch C started). See `docs/PROGRESS.md` backlog for the two lower-severity findings carried forward.

## Findings

| Severity | File | Finding | Status |
|---|---|---|---|
| Major (M1) | `packages/core/src/league/playoff-odds.ts` | Doc comment claimed `sum(playoffPct) == playoffTeams` and `sum(byePct) == firstRoundByeCount` hold "exactly, by construction," but this breaks silently whenever `playoffTeams` or `firstRoundByeCount` exceeds the team count (reproduced: 2 teams, `playoffTeams: 10` gives every team `playoffPct: 1`, sum 2 not 10). No validation, no test for the out-of-range case despite the original brief calling it out. | Fixed, see fix-round report below. |
| Minor (m1) | `packages/core/src/league/playoff-odds.ts` | No perf smoke test for the per-iteration ranking sort (unlike `sim/matchup.perf.test.ts`'s SIM-3 test). Reviewer manually benchmarked a realistic 12-team/7-week/10,000-iteration run at ~33ms -- not a current bottleneck, but nothing in the committed suite would catch a future regression. | Backlog (`docs/PROGRESS.md`, Phase 5 section). |
| Minor (m2) | `packages/core/src/league/playoff-odds.ts:146` | `seeds.get(t.rosterId) as number` is provably safe but is a `Map.get` cast (a different, less obviously-safe category than the file's other `noUncheckedIndexedAccess` array-index casts) with no comment explaining why it's safe. | Backlog (`docs/PROGRESS.md`, Phase 5 section). |

## Requirements coverage

LEAGUE-5 implemented and tested (determinism, sum invariants in-range, seed-distribution normalization, zero-remaining-games special case, bye null/populated, dominant-team sanity, exact-tie handling). Divisions and "tiebreaker per league settings" stay on the existing `compareStandings`/no-division convention per ADR-016, not a new gap.

## Checks run by the reviewer (independently)

- `pnpm --filter @sideline/core typecheck` -- clean
- `vitest run src/league/playoff-odds.test.ts` -- 14 passed
- `eslint src/league/playoff-odds.ts src/league/playoff-odds.test.ts` -- clean
- `git diff --stat` -- confirmed no ownership violations
- Manual `npx tsx` repro scripts (not committed) confirming the M1 invariant break and benchmarking the 33ms perf figure
