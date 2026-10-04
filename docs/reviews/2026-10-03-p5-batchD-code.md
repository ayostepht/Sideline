# Code review: Phase 5 Batch D (T5.5a, T5.5b, T5.5c)

Date: 2026-10-03
Scope: `git diff bcc5cfe..698c0fd` on `phase/5-matchups` -- Home win-probability card (T5.5c, `9ed83e3`), League intelligence sections (T5.5b, `d05ad4b`), Matchup page (T5.5a, `698c0fd`). 25 files, 1744 insertions.

## Verdict

CHANGES REQUIRED (one Major; fixed same-session). See `docs/PROGRESS.md` backlog for the Minor/nit findings carried forward.

## Findings

| Severity | File | Finding | Status |
|---|---|---|---|
| Major (M1) | `apps/web/app/l/[leagueId]/matchup/page.tsx` | `getMatchup` returns `not_found` both for a nonexistent league and for "season hasn't started" (NFL state never synced); the page couldn't distinguish them and hard-404'd on both, unlike every sibling page (Home, Lineup, Waivers), which all show a friendly preseason message in this exact case. | Fixed, see fix-round commit `9d40b23`. |
| Minor (m1) | `apps/web/app/l/[leagueId]/league/_components/format.ts`, `playoff-odds.tsx` | `sortByPlayoffPctDesc` is exported and tested but never called; `playoff-odds.tsx` duplicates the identical sort inline instead. Dead code / missed reuse. | Backlog (`docs/PROGRESS.md`, Phase 5 section). |
| Minor (m2) | `apps/web/app/l/[leagueId]/league/_components/all-play-luck.tsx`, `apps/web/app/l/[leagueId]/(main)/page.tsx` | Two numeric figures (all-play's "actual vs expected wins" caption; Home's tie-chance percentage) lack `tabular-nums`, unlike every other stat figure in this batch. | Backlog, same section. |
| Nit (n1) | `all-play-luck.tsx`, `positional-strength-grid.tsx` | Undocumented magic-number thresholds (luck sign cutoff, heatmap tone bands) -- no comment explaining the chosen values. | Backlog, lowest priority. |
| Nit (n2) | `(main)/page.tsx` | `Math.round(tieProbability * 100)` computed twice in one ternary; no behavioral effect. | Backlog, lowest priority. |

## Requirements coverage

SIM-1/SIM-2 (Matchup), LEAGUE-1 through 6 (League intelligence sections), and the Home card all implemented and traced to real DTO fields (`packages/shared/src/api/matchup.ts`, `league-intelligence.ts`), verified by the reviewer reading the actual JSX rather than trusting subagent claims -- specifically confirmed manager-tendencies' null-vs-zero FAAB distinction holds in both data access and copy, and that playoff-odds' explanatory copy doesn't overclaim beyond what the data function actually guarantees.

## Checks run by the reviewer (independently)

- `pnpm build` -- all 15 app routes compiled
- Manual route-size measurement via `scripts/gate/routes-size.ts` against real build output -- matches each task's self-reported figures exactly (Matchup 163,244 B, League 178,897 B, Home unchanged)
- `pnpm verify` -- 142 files, 1374 tests, lint/format/typecheck all clean
- `git diff --name-only` cross-checked per commit -- confirmed all three tasks file-disjoint, none touched `apps/web/lib/server/` or any API route
- grep for `any`, unsafe casts, non-null assertions, `.skip`/`.only` -- none found in production code
