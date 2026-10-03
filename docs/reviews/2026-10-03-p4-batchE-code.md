# Phase 4 Batch E code review

Date: 2026-10-03. Branch: `phase/4-waivers`. Scope: commits `1415d02` (T4.8c), `1e9a764` (T4.6b), `64af436` (T4.6a). Reviewer: code-reviewer subagent.

VERDICT: CHANGES REQUIRED (1 Major; fixed before Batch F)

## Findings

**[M1] Major** `apps/web/app/l/[leagueId]/players/_components/players-explorer.tsx` — calls `router.replace(...)` after every client-side filter/search/pagination fetch. Because the route is `force-dynamic` and reads `searchParams`, this triggers a second real RSC round trip re-running `getPlayersList`/`getLeagueOverview` server-side on every interaction, doubling DB load per click and risking a visible flash back to the loading skeleton. Confirmed live via Playwright network probe: clicking a position filter fires both the intended `/api/l/.../players` fetch AND an unwanted `_rsc=...` navigation request. The sibling Waivers task in this same batch solved the identical problem correctly with `window.history.replaceState` (confirmed via the same live probe: zero extra requests on tab switch or filter).

**Resolution:** dispatched a fix round to frontend-engineer to mirror Waivers' `history.replaceState` approach.

**[m1] Minor — resolved directly by the orchestrator.** Two untracked, unrelated leftover debug scripts (`overflow_check_tmp.ts`, `overflow_multi_tmp.ts`) were left at the repo root by a concurrent agent's manual visual-QA process, picked up by the root tsconfig/eslint globs and breaking `pnpm verify`'s Level 1 check. Deleted (untracked, not referenced by any commit, confirmed via `git status`); `pnpm verify` green again (118 files / 1173 tests).

## Notable due-diligence checks (not findings)

- **Shared-barrel-file split verified correct this time**: `git show 1e9a764 -- schemas.ts` adds only `PlayersListResponseSchema`; `git show 64af436 -- schemas.ts` adds only `WaiverResponseSchema`. Both commits independently typecheck in isolation via `git worktree` + `pnpm --filter @sideline/web typecheck` — the ADR-015 process fix from Batch D held.
- T4.8c's "renders identically when `projectedPoints` is absent" guarantee verified via real string-diff tests against an explicit-undefined variant, not just presence-when-set assertions.
- T4.6a's "no refetch on tab switch" and `replaceState`-not-router claims verified true via live network probe, not just code reading.
- T4.6b's "season average" (not "projection") labeling verified honest against the actual data available; its bundle-fix (lazy zod import) verified complete via a grep for eager schema imports in client components.
- SSR pages for both Waivers and Players correctly read filter/pagination state from `searchParams` on initial render, so bookmarked/refreshed filtered URLs work (not just client-side state that resets on refresh).

## Checks run

Live Playwright network probes against a running dev server for all three double-fetch/no-refetch claims; `git worktree` isolation checks on both frontend commits; full `pnpm verify`; targeted eslint/prettier/vitest on batch files; grep sweeps for eager zod imports and `projectedPoints` producers.
