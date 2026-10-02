# Code review: Phase 1 Batch C (T1.3b, T1.5a, T1.6-build, T1.6)

Date: 2026-10-02 | Reviewer: code-reviewer | Commits: fd8023f, 45c4b9e, 34e0e78, 7995e8e | Verdict: CHANGES REQUIRED (3 Major)

Checks: `pnpm verify` green (45 files, 452 tests).

## Major

- **M1** `apps/worker/src/cli/sync.ts:80-91`: the CLI checks the heartbeat once, then waits up to 10 min even if the worker died; the request stays pending or running, a later worker start runs it unexpectedly, and the API dedupes onto it for up to 15 min. Fix (T1.5a-fix): re-check the heartbeat in the loop; on staleness print "worker stopped", fail a still-pending request, exit 1. Test with a heartbeat going stale mid-wait.
- **M2** `apps/worker/src/runner.ts:38`, `packages/sleeper/src/http/client.ts`: lease-loss abort is cooperative and unproven: no job yet passes `ctx.signal` to Sleeper fetches, and the HTTP client takes no signal. Fix (T1.5b brief): the client accepts a signal; every Sleeper call passes `ctx.signal`; jobs check `signal.aborted` before each request; test that no fetch happens after a mid-job lease loss.
- **M3** `apps/web/lib/server/sync.ts:33-46` vs `apps/worker/src/schedule.ts:12-24`: two cadence tables, already drifted (projections 6 h in web, 60 min in worker). Fix (T1.6-fix then T1.5a-fix): one `SYNC_CADENCE_MS` in `@sideline/shared`, projections 60 min, used by both; test every job has an entry.

## Minor

- **m1** `apps/web/lib/server/sync.ts:110-121`: raw SQL duplicates enqueue's blocking rule; `deduplicated` derived from timestamp equality is fragile. Fix (T1.6-fix): `findActiveRequest` in db; an enqueue variant returning `{ request, created }`.
- **m2** `apps/worker/src/worker.ts:85`: reap on re-acquire briefly fails the in-process job's own rows. Fix (T1.5a-fix): reap only rows started before the lease was acquired, or skip on in-process re-acquire.
- **m3** `worker.ts:89,165-168`: after restart, never-succeeded jobs and cron jobs fire immediately; a poisoned job retries every restart. Fix (T1.5a-fix): seed lastAttempt from the latest run including failures.
- **m4** `apps/worker/src/main.ts:27-35`: shutdown waits for the current job without a timeout; docker kills after 10 s. Fix (T1.5a-fix): race with about 8 s.
- **m5** `apps/web/next.config.ts:25-28`: `externals` spread assumes an array; docker standalone with the native binding unverified. To T1.8.
- **m6** `packages/db/src/upserts.ts:80`: volatile timestamps only move on real changes; freshness UI must use `sync_runs`. Note for Phase 2 briefs.
- **m7** `worker.ts:42`: ISO string comparison on `kickoff_utc` relies on a consistent `Z` format. To T1.5c (pin with a test).

## Nit

- **n1** `apps/web/app/api/sync/run/route.ts:6`: no request body size cap. Backlog (T6.1).

## Verified sound

Lease TTL and renewal cadence, heartbeat only while holding the lease, CLI exits 2 when another process holds the lease, serial scheduling, cron overrides and DST, null-safe change counting with stable JSON, strict snapshot rule, bound SQL values, chunked players, atomic trending replace, health and POST status mapping, no `any`, ownership.
