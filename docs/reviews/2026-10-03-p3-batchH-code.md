# Code review: Phase 3 Batch H (T3.8a, T3.8b) plus the readPositionCv hotfix

Date: 2026-10-03. Branch: `phase/3-scoring`. Diff reviewed: `d280475..352af52` (commits `78d8f34`, `dbf69f0`, `352af52`).

VERDICT: CHANGES REQUIRED (both Major findings fixed before the next batch, commit `7bf57e3`).

## Findings

- **[M1] Major** `e2e/pages.spec.ts:163-187` (STATE-3): still asserts `data-testid="stub-page"` for `seg="lineup"`, but T3.8a removed `StubPage` from the Lineup page entirely. Will fail deterministically at the next e2e run. Not fixed here (qa-engineer owns `e2e/`); folded into T3.9's brief instead of fixed by frontend-engineer.
- **[M2] Major** `apps/web/app/l/[leagueId]/lineup/page.tsx`: `getLineup`'s `Lookup` reason `"not_found"` is returned both for genuine preseason and for an explicit `?roster=` that doesn't exist, so a stale/bad roster id falsely showed "The season has not started." **Fixed, commit `7bf57e3`**: the page now checks the parsed `rosterId` against the already-fetched `standings` rows and calls `notFound()` when it doesn't match, before falling through to the preseason message.
- **[m1] Minor** `apps/web/app/l/[leagueId]/league/teams/[rosterId]/page.tsx`: didn't pass the new `totalRosters` prop to `TeamView`, so a team detail view showed "Rank N" with no "of N" unlike Home/My Team. **Fixed, commit `7bf57e3`**.
- **[m2] Minor** `apps/web/lib/server/lineup.ts` `readPositionCv`'s single-qualifying-player-per-position case is correct but untested. Backlog.
- **[m3] Minor** `packages/db/src/cache.ts`'s `computed_cache` keys only on data-input timestamps, never on algorithm version, so a running instance's cache could keep serving a pre-fix (Safe-mode-floor-0) lineup payload until the next relevant sync. Backlog, same shape as the existing ADR-013 item 19 cache-staleness note.
- **[n1] Nit** `summary-banner.tsx`'s doc comment overstates which element is "the" lime accent (it's `bg-accent-soft`, not the literal `--primary` lime the mode toggle's active pill uses). Not fixed, cosmetic comment only.

## Requirements coverage

LINEUP-1..9, PROJ-2 all traced; see full subagent report for detail. The `readPositionCv` hotfix (`352af52`) was independently verified by the orchestrator: reverted locally, confirmed the new regression test fails against the old pooled implementation, restored, confirmed it passes.

## Checks run

`pnpm verify` (951, then 953 after the fix commit, unit tests; typecheck; lint; format) green throughout. No ownership violations: all files within frontend-engineer's (`apps/web/app/**` non-api, `apps/web/components/**`) or backend-engineer's (`apps/web/lib/server/**`) owned paths.
