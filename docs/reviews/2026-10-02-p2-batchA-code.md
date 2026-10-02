# Code review: Phase 2 Batch A0+A (T2.0, T2.2a, T2.1a, T2.0b)

Date: 2026-10-02 | Reviewer: code-reviewer | Diff: `3327dae..775680b` (lockfile and drizzle meta excluded) plus `docs/self-hosting.md` (17af2ce)

VERDICT: APPROVE. 0 Blocker, 0 Major, 12 Minor, 1 Nit. `pnpm verify` green (57 files, 552 tests).

## Privacy guard (ADR-009 item 17)

No path found to run `pnpm screens` or the gate UI steps against `./data`. `planDataDir` refuses an external `E2E_BASE_URL` without `--unverified`. An explicit DATA_DIR must pass `assertSeededDataDir` (realpath containment in `<root>/data`, plus a marker for the fixture league). Otherwise screens seeds its own temp dir. Gate UI4 requires the `DATA_DIR <path> (seeded fixture)` line. Symlinks are handled.

## Findings

| ID | Sev | Where | Problem | Fix | Routed to |
|---|---|---|---|---|---|
| m1 | Minor | scripts/lib/seed.ts:21-41 | `realpathSync` does not normalize case on macOS, so `./DATA` isn't detected as inside `./data`. Only the marker check blocks it (defense in depth fails silently) | `realpathSync.native` or a case-insensitive compare; add a test | T2.0b-fix |
| m2 | Minor | playwright.config.ts:70 | `E2E_DATA_DIR` is not validated, so `E2E_DATA_DIR=./data pnpm test:e2e` could write to real data | Run `assertSeededDataDir` when the variable is set | T2.5a |
| m3 | Minor | lighthouserc.json:6, gate ui3 | lhci `startServerCommand` hard-codes `mktemp -d`, so UI3 audits an empty DB | Use the seeded `E2E_DATA_DIR` | T2.5a |
| m4 | Minor | packages/shared/src/api/league.ts:28-30 | Standings sort has no final tiebreaker | `rosterId asc` as the last key; document and test | T2.2a-fix |
| m5 | Minor | packages/db/src/user-leagues.ts:15-37 | Deletes by the `season` parameter but inserts `l.season` | Assert they match, or delete by the seasons present | T2.2a-fix |
| m6 | Minor | packages/db/src/sync-bookkeeping.ts:177-183, 288 | Unparsable `params_json` silently becomes null. Dedupe is case-sensitive, but Sleeper usernames are case-insensitive | Normalize username (trim, lowercase); flag bad params so the worker fails the request | T2.2a-fix, T2.2c |
| m7 | Minor | apps/worker/src/worker.ts:94,132 | `user` and `user_leagues` requests parse to no jobs and may be marked done without running | Worker fails unknown jobs explicitly; onboarding works end to end only after T2.2c | T2.2c |
| m8 | Minor | packages/db/src/sync-reads.ts:22 | `seasonType as SeasonType` is an unsafe cast | Parse with the shared zod enum | T2.2a-fix |
| m9 | Minor | packages/shared/src/api/onboarding.ts:34-39 | Status doesn't tie `error` to `failed` or `leagues` to `ready` | Discriminated union on `phase` | T2.2a-fix |
| m10 | Minor | apps/web/components/player-row.tsx:81 | `aria-current="true"` for "highlighted" misleads screen readers | Visually hidden label instead | T2.1b |
| m11 | Minor | apps/web/app/layout.tsx:15-18 | `themeColor` follows the OS scheme, not the in-app toggle | Known limitation | T6.3 backlog |
| m12 | Minor | gallery page, playwright.config.ts:107-112 | Playwright's webServer doesn't set `SIDELINE_GALLERY`, so a standalone e2e run sees 404 on the gallery | Set it in webServer env | T2.5a |
| n1 | Nit | scripts/lib/paths.ts:5 | `redactHome` replaces a bare prefix (`/Users/steph` would mangle `/Users/stephanie2`) | Match `home + sep` or end of string | T2.0b-fix |

## Confirmed OK

- Migration 0001 is additive (new table, nullable column).
- Gallery gate is checked at request time (`force-dynamic`).
- `allowedDevOrigins` is empty unless `SIDELINE_DEV_ORIGINS` is set (dev:lan only).
- Components never signal by color alone; focus-visible and reduced-motion rules exist; buttons are at least 44px.
- No `any`.
- Ownership matches ADR-008 and ADR-009 item 13.
- Freshness semantics are tested.
- Onboarding jobs are kept out of `SYNC_JOB_NAMES`.
