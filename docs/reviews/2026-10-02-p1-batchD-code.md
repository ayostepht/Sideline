# Batch D code review (T1.8, T1.7a, T1.5b)

Date: 2026-10-02 | Diff: `git diff 0aed7c8..3091394` (38 files) | Reviewer: code-reviewer (static read, no tests run)

VERDICT: APPROVE (0 Blocker, 0 Major)

## Findings

- **m1** `apps/worker/src/jobs/common.ts:44-47`: `loadState` reuses the stored nfl_state forever and only fetches when the row is missing. If the state row is stale, stats, projections, matchups and transactions use the wrong week. Fix: refetch when `updated_at` is older than about 1 h, or run `state` first in `ALL_ORDER`, plus a test.
- **m2** `apps/worker/src/jobs/data-jobs.ts:212-221`: the backfill treats a week as stored if any row exists, so a partial week is never refetched. Fix: write each week in a single transaction, with a test, or refetch weeks that look too small.
- **m3** `apps/worker/src/jobs/data-jobs.ts:62-63`: `upsertPlayers` and `writePlayersFetchedAt` are separate writes. A crash between them causes a second `/players/nfl` fetch that day. Fix: put both in one transaction.
- **m4** `packages/sleeper/src/http/client.ts:~187`: `limiter.acquire` is not abortable. Compliance holds because the signal is checked again after acquire; the only cost is a delayed lease release. Accepted.
- **m5** `apps/worker/src/jobs/db-reads.ts:12-24`: raw SQL with `as` casts and an unvalidated `seasonType`. Move it to `packages/db` with typed helpers.
- **m6** `apps/worker/src/jobs/jobs.test.ts:327`: a real 20 ms sleep in a test. Use `vi.waitFor` or fake timers.
- **m7** `tests/contract/sleeper.contract.test.ts`: the contract suite calls fetch directly (no limiter), CONTRACT-3 has no once-per-day guard, and the suite exits 0 without `DEFAULT_LEAGUE_ID`. These are manual-only and gated by `CONTRACT_PLAYERS=1`. Add a header comment.
- **m8** `packages/db/package.json` (+tsx) and `apps/web/next.config.ts` were changed by devops-engineer outside the roster paths. Logged as ADR-008.
- **n1** `apps/worker/src/jobs/common.ts:8`: `SIDELINE_VERSION` is hardcoded to "0.1.0". Read it from package.json or test that they match.

## Checks that passed

Idempotent upserts. Abort is checked before each call, after the limiter, after the retry sleep and on fetch error. Every Sleeper call goes through the shared limiter, and players are gated at 24 h with `etag: false`. zod validates at the boundary. Docker runs as non-root `node` with tini, and compose bakes in no secrets. e2e uses a temp `DATA_DIR`. No real identifiers in tracked files (the orchestrator also confirmed the gate JSON files hold no local path). No `.skip` or `.only`.

## Disposition

m1, m2, m3, m6 and n1 are folded into T1.5c (sleeper-data-engineer). m4 is accepted. m5 and m7 are in the backlog. m8 is ADR-008. Follow-up for the auth task: the app must refuse to start when `SESSION_SECRET` or `APP_PASSWORD` is empty.
