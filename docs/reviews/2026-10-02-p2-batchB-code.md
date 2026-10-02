# Code review: Phase 2 Batch B1+B2 (T2.0b-fix, T2.2a-fix, T2.1b, T2.2c, T2.2b)

Date: 2026-10-02 | Reviewer: code-reviewer | Diff: `1225d42..cfd1d59` (docs excluded), 62 files

VERDICT: CHANGES REQUIRED. 0 Blocker, 1 Major, 8 Minor. `pnpm verify` green (65 files, 632 tests). Perf p95 is 1 to 4 ms against the 300 ms bound.

Batch A fixes spot-checked: m4, m6, m7, m9 and m10 are addressed. m1, n1, m5 and m8 were not individually re-verified (the orchestrator verified m1 and n1 tests at commit e20055a).

## Findings

| ID | Sev | Where | Problem and failure scenario | Fix | Routed to |
|---|---|---|---|---|---|
| M1 | Major | apps/web/lib/server/onboarding.ts:125, sync.ts:91-106 | `selectLeague` reuses `requestSyncOn(h, "all")`. Its 60 s debounce returns `rate_limited`, and its active-request dedupe returns a running `all` that already read the old league. Either way the new league isn't synced until the scheduled cadence, and onboarding lands on an empty Home with no signal | A league change bypasses the debounce; dedupe only against a pending `all` (which reads the active league at run time); enqueue a fresh one when an `all` is running. Tests for both paths | T2.2b-fix |
| m1 | Minor | onboarding.ts:53-55, 101 | `user_leagues` season falls back to the UTC year when `nfl_state` is empty. That is the wrong season in Jan-Feb on a fresh DB, giving `ready` with no leagues | Stay in `loading_leagues` until nfl state exists, or enqueue `state` first | T2.2b-fix |
| m2 | Minor | api-handlers.ts:120-128 | Changing the username keeps the previous user's `active_league_id` | Clear the active league when the user id changes | T2.2b-fix |
| m3 | Minor | onboarding.ts:49-51 | The failed-phase error passes through worker text, which may include the request URL and username | Map known errors (unknown user); generic fallback otherwise | T2.2b-fix |
| m4 | Minor | league-views.ts (raw `prepare` at 42, 98, 161, 174, 275, 302), onboarding.ts:44, 59, worker `failUnknownJobs` | Raw SQL outside `@sideline/db` duplicates schema knowledge (parameterized, no injection found) | Move reads into `@sideline/db` typed helpers | Backlog (backend, then worker) |
| m5 | Minor | league-views.ts:132, 271-278 | `isMine`/`getMyTeam` use `owner_id` only (co-owners ignored); `LIMIT 1` without `ORDER BY` | `ORDER BY roster_id`; document co-owner handling | T2.2b-fix |
| m6 | Minor | league-views.ts:301-310 | SQLite `lower()`/`instr` are ASCII-only, so names with diacritics don't match case-insensitively | Normalized `search_name` at sync time, or document | Backlog |
| m7 | Minor | apps/web/components/why-sheet.tsx:40 | `key={r.code}` collides when reasons repeat a code | Index plus code | T2.3a |
| m8 | Minor | apps/worker/src/fixture-mode.ts | Production refusal depends on `NODE_ENV=production`; the runtime image sets it, but how the worker is containerized is undecided | The worker container must inherit it; add a check | T4.3 backlog |

## Checks on the orchestrator's questions

1. **Onboarding contract web to worker works** apart from M1 and m1. The web stores the lowercased username and nulls the user id on change; the worker stores the id and canonical username; phases derive correctly, including `worker_offline`. The `user_leagues` enqueue on poll is transactional with params-keyed dedupe, so concurrent polls can't duplicate. Failures surface as `failed`.
2. **League switch:** Major (M1).
3. **Single caller:** apps/web has no `@sideline/sleeper` import and no Sleeper URL. Fixture mode exits 1 under `NODE_ENV=production` (see m8).
4. **SQL:** parameterized; starters "0" handled as `emptySlots`; BN, IR and TAXI excluded from labels; reserve and taxi not double-counted; bye derivation requires 18 weeks; search tiebreaks deterministic; `test-seed.ts` imported only by tests.
5. **Accessibility:** ErrorState `role=alert`, StaleBanner `role=status`, Sparkline `role=img` with a hidden table, skeleton `aria-busy` with "Loading". WhySheet relies on the Radix focus trap (no focus tests, a coverage gap).
6. **Tests** assert behavior; no `.skip`, `.only` or sleeps; perf bound generous.
7. Validation errors name fields only; zod at every handler boundary; no `any`.
