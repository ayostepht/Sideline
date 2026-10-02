# Batch F code review (T1.7b)

Date: 2026-10-02 | Diff: `git show 08c4d7a` (6 files under tests/) | Reviewer: code-reviewer | Tests: `pnpm test:integration`, 22 passed

VERDICT: APPROVE (0 Blocker, 0 Major, 3 Minor). No ownership violations. No skip, only or skipIf.

## Vacuity and isolation (all clear)

- RATE-1 is not vacuous. It checks that the total is above the first minute's count, that there are at least 20 `/matchups/4` calls, that there is exactly one `/players/nfl` call, and that the limiter count matches the requests on the wire.
- The fake timers do advance. SYNC-3b sees no retry at delay minus 1 ms and exactly one retry at delay plus 1 ms. SYNC-3c confirms the hang handler ran, then that the job failed with a timeout error.
- CLI-4a/4b use no-op jobs on purpose. Renewal is proven by another holder failing to take the lease after more than twice the TTL. Lease loss is proven three ways: the next job never ran, the exit code is 1, and the other holder's row is intact.
- msw rejects unhandled requests (`tests/msw/server.ts:29`). Temp dirs are cleaned up, `DATA_DIR` is restored, and `resetDbForTests` runs before and after each test.

## Findings

- **m1** `tests/helpers/sync-harness.ts:174-193`, `sync-failures.integration.test.ts:38-52`: `drive()` advances the clock using the client's `retry` warn log. If that log's shape changes, the test hangs instead of failing. Fix: stop `drive()` after a set number of iterations.
- **m2** `sync-rate.integration.test.ts:78`: the rate test uses a fake limiter. The 300-per-60 s bound comes from how often jobs are scheduled, not from the limiter enforcing it. The limiter's unit tests cover enforcement. Fix: add a comment.
- **m3** `sync-rate.integration.test.ts:55-59`: each tick advances one minute, so a burst within one tick is treated as simultaneous. This is conservative and needs no change; optionally add a comment.

## Disposition

m1 and m2 are in the PROGRESS backlog for qa-engineer. m3 needs no change.
