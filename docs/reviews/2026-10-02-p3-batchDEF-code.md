# Code review: Phase 3 Batches D, E, F

Date: 2026-10-02
Scope: `git diff 42d8798..HEAD` on `phase/3-scoring` at review time: matchup core (MATCH-1/2/4), 12 golden scenarios + 1000-run property suite for the optimizer (plus two bug fixes it found), three more `packages/db` read helpers, the MATCH-3 backtest harness, and the `defense_vs_position` worker recompute hook. 32 files changed, 3162(+)/46(-).
Reviewer: code-reviewer subagent (read-only).

## Verdict

CHANGES REQUIRED at review time (one Major). Fixed before Batch G; see commit `c2c6da2`.

## Findings

### [M1] Major — non-deterministic stats-source precedence in two DvP joins

`apps/worker/src/recompute-hooks/defense-vs-position.ts` and `scripts/backtest/backtest.ts`'s stats-by-week index both took "whichever `player_week_stats` row `readPlayerWeekStats` happened to return last" when more than one source (`sleeper`, `nflverse`) exists for the same `(season, week, playerId)` — exactly the ambiguity the table's own primary key anticipates by including `source` as a key column. The sibling hook `league-points.ts` already solved this with a documented `SOURCE_PRIORITY` preferring `sleeper`. Currently latent (only the Sleeper stats job writes `player_week_stats` today), but the architecture anticipates a second source, and without the fix the DvP computation — and the backtest's accuracy conclusion about it — would be non-deterministic once one exists.

**Fix (commit `c2c6da2`):** both join sites now apply the same `SOURCE_PRIORITY` dedup as `league-points.ts`. `backtest.ts` got a new `indexStatsByWeekAndPlayer`, kept separate from the existing `indexByWeekAndPlayer` (still used for projections, which have no `source` field). Re-verified: `pnpm verify` 919 tests, 0 failures.

### [m1] Minor — root `package.json` edit not ratified (ratified here)

T3.5c (analytics-engineer) edited the root `package.json`'s `backtest` script line, one line, correct content, but root config files are devops-engineer-owned per CLAUDE.md section 2 and this crossing had no `docs/DECISIONS.md` ratification note (unlike T3.5c's `docs/DECISIONS.md` ADR-014 entry, which the review was told was already reviewed and ratified). Ratified now in ADR-013 item 16 below, matching precedent (ADR-013 items 6, 10, 15): a one-line script-wiring edit to the agent's own deliverable, same pattern `scripts/validate-scoring` (T3.1) and `tests/fixtures` (T0.3b) used for root `package.json` previously.

### [m2] Minor — `matchupGrade` has no divide-by-zero guard

`packages/core/src/matchup/grade.ts:29-32`. `totalTeams === 0` would produce `NaN`/`0` with no guard or comment, unlike every other divide-by-zero case in this batch (`multiplier.ts`, `defense-vs-position.ts`), which are explicitly guarded and commented. Not reachable today (every real caller passes 32, the NFL team count). Backlog; not fixed.

### [n1] Nit — `defense_vs_position` hook recomputes every week each run

`apps/worker/src/recompute-hooks/defense-vs-position.ts`. O(W^2) over weeks (recomputes `1..throughWeek` from scratch for every `throughWeek`), negligible at NFL scale (≤18 weeks), matches the sibling `league-points.ts` hook's existing full-recompute convention. Informational; not fixed.

## Requirements coverage (as reviewed)

MATCH-1 through MATCH-4: all correctly implemented and tested; M1 affected the hooks'/backtest's input fidelity, not the pure MATCH-1 function itself. MATCH-3's real gate-time run stays deferred per ADR-014 (not a gap in this diff). LINEUP-8: both property-test bug fixes (commits `6137927`, inside `d2550d4`) confirmed complete; no other code path in `recommendLineup`/`solveOptimalAssignment` has the same bug class; the earlier `23bcad0` fix remains consistent.

## Checks the reviewer ran

`git log --oneline` / `git diff --stat` over the scope; `pnpm verify` (919 tests at review time); manual trace of `computeDefenseVsPosition`, `matchupMultiplier`, `matchupGrade`, the Hungarian solver, `recommendLineup`'s lock/pool logic, and the backtest's `buildDvpContext`/`rank`/`pearson`/`spearmanRho`/grid-search against their doc comments and tests; an ownership scan of every changed file path against CLAUDE.md section 2.
