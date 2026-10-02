# Code review: Phase 1 Batch B (T1.3a, T1.2b, T1.4b)

Date: 2026-10-02 | Reviewer: code-reviewer | Commits: 195826e, 38ee8a4, f759d28 | Verdict: CHANGES REQUIRED (3 Major)

Checks: `pnpm verify` green (38 files, 373 tests). Ownership clean.

## Major

- **M1** `packages/db/src/schema.ts:59-84`: `rosters` lacks `waiver_position` (shared `Roster.waiverPosition`; the only priority signal under rolling waivers). `waiver_budget_used` should be `real`. Fix in T1.3a-fix.
- **M2** `schema.ts:29-44`: `leagues` lacks `total_rosters` (shared `League.totalRosters` required). Fix in T1.3a-fix with a mapLeague -> row -> League round-trip test.
- **M3** `sync-bookkeeping.ts:161-214`: no recovery for requests or runs stuck in `running` after a worker crash; `enqueue` dedupes against them forever, so manual sync dies. Fix in T1.3a-fix: `reapStale` (worker calls it at boot in T1.5a).

## Minor

- **m1** `sync-bookkeeping.ts:303`: same holder id re-acquires; holder ids must be unique per process. Fix in T1.3a-fix (document plus test).
- **m2** `packages/providers/src/cache.ts:34`: on-disk meta cast without zod. Backlog (sleeper-data-engineer).
- **m3** `cache.ts:92-119`: unguarded cache writes, fixed tmp name, gz/meta not atomic as a pair; write failure mislabeled `parse` and valid data discarded. Backlog (sleeper-data-engineer).
- **m4** `packages/sleeper/src/endpoints/real-rows.ts:56-57`: rows without a `player` block count as position drops; real rows could be lost if Sleeper omits it. T1.5b: log loudly when position drops exceed a threshold.
- **m5** `real-rows.ts:38`: stats rows without `gp` (only `gms_active`) are kept; downstream must treat them as did-not-play. T3.1 brief.
- **m6** starters `"0"` means an empty slot; not stated in shared. T1.3a-fix: document in shared is out of its scope, so backlog for backend (T1.3b) to add a doc comment.
- **m7** `packages/providers/src/usage.ts:121-122`: `season_type` not filtered (no collision today). Backlog.

## Nit

- **n1** `packages/db/src/connection.ts:1,4`: duplicate `node:fs` imports. Fix in T1.3a-fix.

## Verified OK

Natural keys, timestamp conventions, lease atomicity under BEGIN IMMEDIATE, claim atomicity, isMigrated, Sleeper schemas and mappers, players per-entry validation, ETag opt-out, provider never-throw, conditional GET, DST handling, carryShare denominator, LA to LAR.
