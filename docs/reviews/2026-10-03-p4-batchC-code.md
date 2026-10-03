# Phase 4 Batch C code review

Date: 2026-10-03. Branch: `phase/4-waivers`. Scope: commits `8cb05e0` (T4.5a), `f97a16e` (T4.8b). Reviewer: code-reviewer subagent.

VERDICT: APPROVE (1 Major, a test-coverage gap, fixed before Batch D)

## Findings

**[M1] Major** `packages/db/src/derived-reads.test.ts` — the `"0"` placeholder-exclusion test put `"0"` only inside `starters`, a field `readRosteredPlayerIds` never reads; the actual exclusion check (`players`/`reserve`/`taxi`) was unexercised, so deleting the guard wouldn't have failed any test.

**Resolution (commit `f2f8e8a`):** moved `"0"` into `players`/`reserve` fixtures; verified by inspection the guard (`derived-reads.ts`'s `if (id !== "0") out.add(id)`) is now what the assertion actually depends on.

## Notable due-diligence checks (not findings)

- **Ranking semantics cross-checked against the consumer**: `readLeagueWeekPositionRanks`'s standard competition ranking (ties share a rank, next distinct score skips ahead) matches `packages/core/src/trends/consistency.ts`'s documented `positionRank`/`startableCount` convention exactly (rank 1 = best, `rank <= N` boom, `rank > 1.5*N` bust) — no off-by-one or inverted-rank bug.
- `projectedPoints` confirmed added only to `UNAVAILABLE`/`DOUBTFUL_DISCOUNT`/`QUESTIONABLE_DISCOUNT`, each set to the pre-discount `rawValue` (semantically correct).
- Full diff read of both commits confirms zero `Reason.code` values changed, only `label` text and the one new field.
- `apps/web/app/l/[leagueId]/_components/format.ts`'s `lineupIssueLabel` already overrides `INACTIVE_STARTER`'s label with a player-name lookup, so the web layer isn't affected by that label's copy change.
- Ownership clean on both commits.

## Checks run

`pnpm verify` (110 files / 1090 tests, clean), targeted `vitest run --project db --project core`, em-dash/jargon grep on new copy (CLAUDE.md section 8), full manual diff read of both commits.
