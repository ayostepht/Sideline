# Batch E code review (T1.5c)

Date: 2026-10-02 | Diff: `git show 8433f87` (24 files) | Reviewer: code-reviewer | Tests: `npx vitest run apps/worker packages/providers`, 103 passed

VERDICT: APPROVE (0 Blocker, 0 Major, 4 Minor). No ownership violations.

## Findings

- **m1** `apps/worker/src/jobs/common.ts` (`storeState`): `upsertNflState` and `touchStateFetchedAt` are separate writes. A crash between them causes one extra refetch an hour later. Fix: one immediate transaction.
- **m2** `apps/worker/src/runner.ts:~109`: the changed-tables set skips failed jobs even when they committed rows first. Stats and projections now commit per week, so a job that fails partway can leave writes, and the recompute hooks miss them. Fix: include failed jobs with `rowsChanged > 0`.
- **m3** `apps/worker/src/cli/fixture-fetch.ts:11-34`: the manifest is checked by hand, not with zod. Fix: a small zod schema.
- **m4** `apps/worker/src/jobs/nflverse-job.ts:~50`: no test shows that a real `gametime` that arrives later replaces an approximate kickoff (both `kickoff_utc` and `kickoff_approximate`). Fix: add that test.

## Verified correct

DST: the fallback uses the ET calendar weekday, and 2026-11-01 and 2026-11-12 are pinned. Transactions: nested upserts become savepoints, and no lock is held across network calls. The m1 refetch uses the injected clock and the limiter. Recompute hooks are isolated per hook, sync and async. The `globalThis.fetch` swap is restored in `finally` and runs only in the seed CLI. `/players/nfl` is still once a day, and its marker is written atomically with the players. Tests are deterministic.

## Disposition

All four Minors are in the PROGRESS backlog for sleeper-data-engineer. m4 is also covered by T1.7b, which tests nflverse disabled and failing.
