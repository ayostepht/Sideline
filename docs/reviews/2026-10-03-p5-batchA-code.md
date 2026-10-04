# Code review: Phase 5 Batch A (T5.1, T5.2)

Date: 2026-10-03
Scope: `git diff main...HEAD` on `phase/5-matchups` at commits `605c13f` (T5.1) and `15f19b9` (T5.2) -- `packages/core/src/sim/`, `packages/core/src/league/`, the 2-line `packages/core/src/index.ts` barrel addition, and the preceding docs commit.

## Verdict

CHANGES REQUIRED (one Major; fixed same-session before Batch B started). See `docs/PROGRESS.md` backlog for the two lower-severity findings carried forward.

## Findings

| Severity | File | Finding | Status |
|---|---|---|---|
| Major (M1) | `packages/core/src/sim/matchup.ts` | `SimStarter.actualPointsSoFar` documented as required for `finished`/`in_progress` but typed optional; `flattenStarter` silently defaulted it to 0 with no `Reason` on omission -- a future caller (T5.4) that forgets the field would get a silently wrong simulation result. | Fixed, see fix-round report below. |
| Minor (m1) | `packages/core/src/sim/matchup.ts` | `NO_DRAW = -1` sentinel overlaps a representable (if invalid) real `sd` value; if `sd` is ever exactly -1, the starter is silently treated as zero-variance instead of hitting the sampler's existing `sd <= 0` fallback. | Backlog (`docs/PROGRESS.md`, Phase 5 section). |
| Nit (n1) | `packages/core/src/sim/matchup.ts` | `flattenStarter` builds an intermediate object array then copies into typed arrays; redundant indirection, no perf impact today (~30x margin against SIM-3's budget). | Backlog (`docs/PROGRESS.md`, Phase 5 section), lowest priority. |

## Requirements coverage

All of SIM-1, SIM-2, SIM-3, LEAGUE-1, LEAGUE-2, LEAGUE-3, LEAGUE-4, LEAGUE-6 implemented and tested; LEAGUE-5 correctly out of scope (T5.3, per ADR-016). Full detail in the reviewer's structured report (not reproduced here; see PROGRESS.md task table for the batch's commits).

## Checks run by the reviewer (independently, not just reading subagent reports)

- `pnpm vitest run packages/core/src/sim packages/core/src/league` -- 8 files, 62 tests passed
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check` -- all clean
- grep for `Math.random()`, `Date.now()`, `any`, unguarded `!`, `.skip`/`.only` -- none found
- Manual verification of the mulberry32 and Box-Muller implementations against reference algorithms -- correct
- `git diff --name-only` -- confirmed no ownership violations
