# Code review: Phase 5 Batch C3 (T5.4c)

Date: 2026-10-03
Scope: `git diff 59b4338~1..59b4338` on `phase/5-matchups` -- `apps/web/lib/server/league-intelligence.ts` + test, `packages/shared/src/api/league-intelligence.ts`, `packages/shared/src/index.ts`, `api-handlers.ts` + test, the new route file.

## Verdict

CHANGES REQUIRED (one Major; fixed same-session, closing out Batch C). See `docs/PROGRESS.md` backlog for the two lower-severity findings carried forward. One nit (imprecise ADR citation in a comment) was folded into the same fix round rather than tracked separately.

## Findings

| Severity | File | Finding | Status |
|---|---|---|---|
| Major (M1) | `apps/web/lib/server/league-intelligence.ts`, `packages/shared/src/api/league-intelligence.ts` | `simulatePlayoffOdds`'s season-level `reasons` (e.g. the zero-remaining-games explanation) was read nowhere and had no schema field, unlike every other section of the response, which all carry `reasons: Reason[]`. A degenerate playoff-odds result (end of season, bye-heavy league) would show in the UI with no explanation. | Fixed, see fix-round report below. |
| Minor (m1) | `packages/shared/src/api/league-intelligence.ts` | DTO doc comment claims `playoffOdds` is null "exactly when `playoffTeams` is null" -- false: it's also null when `playoffTeams` is set but outside `[0, numTeams]` (e.g. a roster removed mid-season). Untested boundary case; comment states an invariant that doesn't hold. | Backlog (`docs/PROGRESS.md`, Phase 5 section). |
| Minor (m2) | `apps/web/lib/server/league-intelligence.ts` | `populationStandardDeviation` is a byte-for-byte reimplementation of the private helper already in `packages/core/src/projections/variance.ts` (correctly not reusing the CV-shrinkage wrapper, but the plain formula itself didn't need re-copying into the web layer). | Backlog (`docs/PROGRESS.md`, Phase 5 section). |

## Requirements coverage

LEAGUE-1, 2, 3, 4, 6 wired and tested correctly. LEAGUE-5 (playoff odds) wired correctly for the numeric outputs (range-guard against `simulatePlayoffOdds`'s throw confirmed by reading the core source, not just trusting the report; schedule-roster-id defensive filter confirmed present and load-bearing) but was dropping its `reasons` (M1) and untested at the out-of-range-but-non-null boundary (m1).

## Checks run by the reviewer (independently)

- `pnpm --filter @sideline/web test -- league-intelligence` -- 33 files, 346 tests passed
- `pnpm --filter @sideline/web typecheck`, `pnpm --filter @sideline/shared typecheck` -- clean
- `eslint`/`prettier --check` on all touched source files -- clean
- Manual cross-reads of `playoff-odds.ts` (range-check and throw conditions), `variance.ts` (sd convention), `roster-strength.ts` (week-window parity), `sync.ts` (SyncJobName list), and the relevant `docs/DECISIONS.md` ADR items
- Confirmed both new raw SQL queries are parameterized, no string interpolation of untrusted input
