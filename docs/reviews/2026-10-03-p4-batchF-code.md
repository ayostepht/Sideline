# Phase 4 Batch F code review

Date: 2026-10-03. Branch: `phase/4-waivers`. Scope: commit `6fa47dc` (T4.6c). Reviewer: code-reviewer subagent.

VERDICT: CHANGES REQUIRED, resolved by folding the fix into T4.7 rather than a separate fix round (see below)

## Findings

**[M1] Major — performance risk, not a correctness bug.** Home's new "Rising players" card calls `getPlayerDetail` in a loop (once per roster player, 15-20 calls) on every Home load. Reading `getPlayerDetail`'s real implementation: `readLeagueWeekPositionRanks` does a full `readPlayersTeamPosition` scan (12,229 rows at real Sleeper scale per `docs/sleeper-api-notes.md`) plus a full `readLeaguePlayerWeekPoints` scan, **per week the player has played** — so real-world cost is `O(roster_size × weeks_elapsed)` full-table scans, worst in week 17-18, exactly when the app has the most content and the most active weekly users. `better-sqlite3` is synchronous, so this blocks the event loop for its full duration on every Home request — in a multi-manager self-hosted league, one user's Home load can stall everyone else's concurrent requests. No existing perf test (`apps/web/lib/server/perf.test.ts`) covers `getPlayerDetail`, `getWaivers`, or this new Home aggregate, and dev verification to date is capped at the fixture's `currentWeek: 4`, so nobody has observed the late-season cost.

**Resolution:** rather than a separate fix round, this is folded into T4.7's brief (the next scheduled task, already covering waiver/perf testing per PLAN) as a required perf test: measure Home's full `readPage` aggregate (including the `getPlayerDetail` loop) against a realistic seed with multi-week `league_player_week_points`/`usage_week` data at a late-season week (~17), assert against the existing 300ms data-function budget, and escalate to backend/analytics for a cache (e.g. a `computed_cache` entry on `getPlayerDetail`) if it fails.

## Minor / Nit (backlog, not blocking)

- **[m1]** `formatSignedPoints(-0.04)` renders `"-0.0 pts"` (negative zero) instead of `"+0.0 pts"`/`"0.0 pts"` — mildly confusing, low impact since values this close to zero are themselves marginal.
- **[n1]** Waiver-targets rows have no individual per-row link (only the card's "See all" link), while risers rows are each individually clickable — matches the brief exactly for each card, just an inconsistency a future pass might reconcile.

## Notable due-diligence checks (not findings)

- No new `bg-primary` lime accent (grep confirms the only occurrence is the pre-existing `HomeIssues` CTA, outside this diff's hunks).
- Both cards' empty states are structurally parallel and correct by inspection.
- Free-agent and roster risers both come from the real `computeTrendSignal` (TREND-4) field on their respective DTOs — no fabricated signal.
- Both cards gate on the same `waivers.ok` boolean as `getMyTeam`, so no orphaned-header case.
- Ownership clean: only the 3 expected files touched.
- Pure helper test coverage (top-3 selection, Rising filters, 5-cap combination) includes real edge cases (under-3, exact-3, empty, roster-first capping).

## Checks run

Full diff read, `pnpm --filter @sideline/web typecheck`/`lint`/test (295 tests) on the batch's files, reading `getPlayerDetail`'s actual implementation and `docs/sleeper-api-notes.md`'s real-scale row counts, a scratch check of `formatSignedPoints(-0.04)`.
