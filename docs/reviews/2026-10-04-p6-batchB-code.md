# Code review: Phase 6 Batch B (T6.1c, T6.3b, T6.3c)

Date: 2026-10-04
Scope: `git diff fd4e0e4..HEAD` (29 files, 1271 insertions / 278 deletions) -- the login page, consolidated preseason/offseason states, and League desktop tables/You-markers/pluralization, plus a same-batch orchestrator integration fix.

## Verdict

APPROVE. Zero Blocker/Major findings. One trivial stale-comment Minor fixed directly (`b808da3`); one Minor already tracked (no e2e for login yet, slotted into T6.4); one nit not actioned (cosmetic, not reachable via normal navigation).

## Findings

| Severity | Location | Finding | Status |
|---|---|---|---|
| Minor (m1) | `power-rankings.tsx:24-26` | Doc comment said `myRosterId` was "not yet threaded through from the page" -- the same-batch integration fix (`de716fd`) wired it through, but the comment was never updated, misleading a future reader. | Fixed directly (`b808da3`). |
| Minor (m2) | `apps/web/app/login/` | No e2e coverage yet for the login/logout round trip -- the first fully client-driven auth flow in the app. | Already tracked in `docs/PROGRESS.md`, slotted into T6.4's "auth e2e" line. No new action. |
| Nit (n1) | `apps/web/app/login/page.tsx` | `/login` is reachable even when `APP_PASSWORD` isn't configured (shows a "Password login is not enabled" error rather than redirecting) -- cosmetic, not reachable via any normal link. | Not actioned (would require a `proxy.ts` change, backend-engineer's file, for low value). |

## Requirements coverage

T6.1c (login/logout, HOST-8's UI half), T6.3b (status-based preseason/offseason consolidation across all 7 pages), and T6.3c (desktop tables, You markers, pluralization) all implemented and verified by the reviewer independently reading `proxy.ts`/`http.ts`/`api-handlers.ts` for the real response contract, confirming no password leakage path (never in a URL, never logged -- `guardedWrite` explicitly excludes the body), tracing `seasonStateFor`'s mapping for all 4 real Sleeper status values plus the unknown-value fallback, and confirming the new desktop-table testids don't collide with `e2e/league.spec.ts`'s existing row-count assertions (exact-string Playwright matching, not substring).

## Checks run by the reviewer (independently)

- `pnpm verify` -- 149 files, 1457 tests, clean
- `git diff --name-only` -- all files within frontend-engineer's owned paths; the integration fix within the orchestrator's 15-line allowance
- Manual read of `proxy.ts`, `http.ts`, `api-handlers.ts` for the login contract
- grep for `.only`/`.skip`, `any`, `eslint-disable`, em dashes -- none found
