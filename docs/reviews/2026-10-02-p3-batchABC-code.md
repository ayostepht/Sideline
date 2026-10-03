# Code review: Phase 3 Batches A, B, C

Date: 2026-10-02
Scope: `git diff main...HEAD` on `phase/3-scoring` at the time of review (commits `7ab5aba`..`e5362c5`): T3.1, T3.2a, T3.2c, T3.3a, T3.4a, T3.2b, T3.3b, T3.4b. 46 files changed, 3799(+)/18(-).
Reviewer: code-reviewer subagent (read-only).

## Verdict

CHANGES REQUIRED at review time (one Blocker, one Major). Both fixed before Batch D; see docs/DECISIONS.md ADR-013 item 12 for the summary and commit references.

## Findings

### [B1] Blocker — optimizer could silently recommend an unavailable player

`packages/core/src/optimizer/recommend.ts:221-244`, interacting with `solve.ts:110-120` (tiebreak) and `availability.ts:40-46` (zero-value statuses).

Every eligible (slot, player) edge in `solveOptimalAssignment` got `row[j] = rawValues[j] + tiebreak`, where `tiebreak` was strictly positive even when `rawValues[j] === 0` (an unavailable player), while the "leave slot empty" dummy column stayed at weight 0. The solver always preferred filling a slot with any eligible player, including a 0-value unavailable one, over leaving it empty. Reproduced directly: one RB slot, one player (`status: "Out"`, rawValue 15, adjusted value 0), no current starter → `optimalAssignment` filled with that player, `issues: []`. Violates LINEUP-4 ("never recommended") and LINEUP-6 (issues list should surface exactly this). No test covered the "only eligible player is unavailable" case.

**Fix (commit pending from the fix-round task):** penalize non-positive-value edges in the tiebreak instead of bonusing them, so the existing `EMPTY_SLOT` issue (already implemented, fires when `optimalAssignment[i].playerId === null`) covers the case with no new issue code needed. Regression tests added at the `solve.ts` and `recommend.ts` levels.

### [M1] Major — embedded NUL byte in a committed file

`apps/worker/src/recompute-hooks/league-points.ts:30-32`. The `pointKey` template literal had a literal `0x00` byte where the separator space should be (` ` rendered identically to a real space in every editor and in the Read tool). This made git treat the file as binary (`Bin 0 -> 4133 bytes`, "Binary files differ" with no content), which would have hidden the file from human PR review and from the privacy identifier grep scan that runs on every staged diff (CLAUDE.md section 6). No runtime bug: the key was used consistently on both the write and lookup sides.

**Fix:** replaced the byte with a real space (commit `346297d`). Purely cosmetic; `pnpm verify` and the worker test suite confirmed no behavior change.

### [m1] Minor — tiebreak epsilon not documented as magnitude-bounded

`packages/core/src/optimizer/solve.ts`. `TIEBREAK_EPSILON = 1e-9` loses its tie-breaking guarantee (and, in a sufficiently pathological case, correctness of which value is optimal) at player-value magnitudes around `1e15`, well outside any realistic fantasy point range (0-60ish). Not exercised by any current caller. Consider documenting the assumed value-magnitude domain in the module doc. Not fixed; backlog.

### [m2] Minor — doc ownership boundary crossed (ratified)

T3.1 (analytics-engineer) appended a subsection to `docs/sleeper-api-notes.md`, which CLAUDE.md section 2 lists as sleeper-data-engineer-owned. This was a deliberate instruction in the T3.1 brief, since ADR-002 item 3 itself delegates documenting the SCORE-3 method to T3.1. Content is accurate and purely additive. Ratified as a one-off exception in ADR-013 item 11; not a new standing rule.

### [m3] Minor — N+1 read pattern in a manual gate script

`scripts/validate-scoring/validate.ts:138-159,188-207` reads one player's stats row at a time inside a nested loop rather than batch-reading a league's `player_week_stats` up front (the way `apps/worker/src/recompute-hooks/league-points.ts` does). Fine for a one-off `pnpm validate:scoring` run; flagged only so the pattern isn't copied into hot-path (API/worker) code. Not fixed; informational.

### [n1] Nit — no nominal type distinguishing a projection row from a real stats row

`packages/core/src/scoring/rescore-projection.ts` / `packages/core/src/projections/base.ts`. `rescoreProjection`'s SCORE-3 exceptions are only meant to apply to projection rows; the `stats` parameter is a plain `Record<string, number>` with no type-level guard against a real stats row being passed in by mistake. Today's only caller (`baseProjection`) is correctly scoped. Consider a branded type if more callers appear. Not fixed; premature given one caller.

## Requirements coverage (as reviewed)

SCORE-1/2/3, PROJ-1 to 4, LINEUP-1/2/3/6/7/9: implemented and tested correctly. LINEUP-4 was implemented incorrectly for the "no eligible alternative" case (B1, since fixed). LINEUP-5 deliberately out of scope for this module per ADR-013 (mode selection lives in the caller-supplied value). LINEUP-8 deferred to qa-engineer's T3.6 per ADR-013 (not a gap in this batch).

## Checks the reviewer ran

`git diff main...HEAD --stat`; `vitest run --project core --project db --project worker` (293 tests) and `--project scripts` (180 tests); `pnpm -w typecheck`; `pnpm -w lint`; `prettier --check` on changed files; grep for `: any`/`as any`/`.skip(`/`.only(`; manual reproduction of B1 via scratch test files (removed after use); byte-level scan of every changed `.ts` file for embedded NUL bytes (found the one instance, M1).
