# Phase 4 Batch D code review

Date: 2026-10-03. Branch: `phase/4-waivers`. Scope at review time: commits `7f324dc` (T4.5c), `daf4251` (T4.5b). Reviewer: code-reviewer subagent.

VERDICT: CHANGES REQUIRED (1 Blocker, 3 Major; fixed before Batch E)

## Findings

**[B1] Blocker — resolved by commit history reorder.** `7f324dc` (T4.5c) added `export * from "./api/waiver.js";` to `packages/shared/src/index.ts`, but `packages/shared/src/api/waiver.ts` wasn't created until the later `daf4251` (T4.5b). Checking out `7f324dc` alone failed `pnpm --filter @sideline/shared typecheck`/`pnpm --filter @sideline/web typecheck` with `TS2307: Cannot find module './api/waiver.js'`. Root cause: both tasks ran in parallel and both edited the shared barrel file `packages/shared/src/index.ts`; when staging each task's commit I ran `git status --short` to spot which files to attribute to which task, but never diffed `index.ts`'s actual content before staging it, so T4.5b's partially-written export line got bundled into T4.5c's commit.

**Resolution:** reordered the two feature commits (T4.5b before T4.5c) via `git worktree` + `git cherry-pick` with manual conflict resolution, moving the misplaced `export * from "./api/waiver.js"` line into T4.5b's commit where `waiver.ts` actually exists. Verified via `git worktree add` on each resulting commit in isolation: both `ee08fc4` (T4.5b) and `f75d318` (T4.5c) independently pass `pnpm --filter @sideline/shared typecheck`, `pnpm --filter @sideline/web typecheck`, `eslint`, and their own test suites. Confirmed the final tree is byte-identical to the pre-reorder state (`git diff` against a backup branch showed no output) before replacing `phase/4-waivers` and deleting the backup. Full `pnpm verify` green throughout (114 files / 1113 tests).

**Process fix:** when two parallel agents are briefed to both potentially touch the same shared barrel file (e.g. `packages/shared/src/index.ts`), diff that file's content before staging it for either commit, don't rely on `git status` alone to attribute it.

**[M1] Major** `apps/web/lib/server/waivers.ts`'s `buildRosterPlayers` — taxi-squad players were lumped into the same `isIR: true` flag as actual reserve/IR players, which (per `lineup-impact.ts`'s `isIR` contract) excludes them from auto-drop-suggestion eligibility. WAIVER-2's spec text is "the lowest-ROS-value **non-IR** player," and taxi is not IR — taxi players are typically a roster's actual lowest-value stash, so this silently makes them permanently un-droppable by the auto-suggestion in any league using taxi squads (common in dynasty/devy leagues).

**[M2] Major** `apps/web/lib/server/waivers.test.ts` — no test exercises the FAAB-league branch (`priorityAdvisor.applicable === false`) end-to-end; verified correct by code reading only, not by an automated test.

**[M3] Major** `apps/web/lib/server/waivers.ts`'s `substituteNulls` doc comment claims the all-missing fallback makes "percentiles tie at 100 for everyone," but hand-verification of the extracted function showed it's actually 50 for `n > 1` (only `n === 1` gives 100). Harmless in practice (a flat, non-discriminating contribution either way) but misleading, and `percentiles`/`substituteNulls` have no direct unit test (only indirect coverage via full `getWaivers` runs that never hit a tie or an all-null metric).

## Minor (fix round includes these too)

- **[m1]** The cache-hit test doesn't assert the in-memory position filter is actually applied correctly post-cache-hit (only that `computed_cache` stays at 1 row) — verified correct by code reading, but a regression here wouldn't be caught.
- **[m2]** `WaiverPriorityAdvisorSchema`'s doc comment says `nextClearAt` is "null only when not applicable," but it's actually computed unconditionally (correct behavior per WAIVER-6d, wrong comment).

## Notable due-diligence checks (not findings)

- Percentile tie-math (fractional rank, ties average their span) hand-verified correct for `[1,1,5,10]`, `n=0`, `n=1`.
- Schedule-strength sign convention cross-checked against `defense-vs-position.ts`'s actual "higher ptsAllowedPg = easier matchup" convention and `matchupGrade`'s grading direction — correct, not inverted.
- `computeLineupImpact` reused directly, not reimplemented.
- SQL injection sweep (string interpolation inside `.prepare()` calls) — none found, all parameterized.
- Full requirements trace: TREND-1 to 5, WAIVER-1 to 4, WAIVER-6a to 6d all implemented and wired.

## Checks run

Full `pnpm verify` at HEAD (114 files / 1113 tests), isolated `git worktree` + targeted typecheck/lint/test on each reordered commit, hand-extraction and execution of `percentiles()`, full manual diff read of both commits, SQL-injection grep.
