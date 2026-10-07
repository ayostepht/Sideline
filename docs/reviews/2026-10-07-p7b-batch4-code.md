# Code review: Phase 7b Batch 4 (P7b.6f, P7b.7f, P7b.8, P7b.9, P7b.10)

Date: 2026-10-07 | Diff: `830f9d6..8fc0ddb` (docs excluded) | Reviewer: code-reviewer
VERDICT: APPROVE. No Blocker or Major findings. Batch 3 M1, M2, m1, m2 confirmed fixed.

## Minor (backlog)
- **m1** `packages/shared/src/api/{lineup,matchup,players}.ts`: `weather` fields are `.nullable().optional()`, a literal-compat shim. Make them required once test literals are updated, so a server regression can't hide as "missing".
- **m2** `apps/web/lib/server/weather.ts:19-33`: exported `synthesizeUnavailable` returns `season: 0`, `kickoffUtc: ""` (overwritten by its caller). Take `season` and kickoff as parameters or unexport it.
- **m3** `lineup.ts:248-256`, `matchup.ts:132-142`: 3-hour `now` bucket in cache hashes adds at most one recompute per roster per 3 hours. Fine; bucket on crossing the 7-day window if cost shows.
- **m4** `apps/web/app/l/[leagueId]/trades/page.tsx:42-60`: Analyzer calls `getTeamDetail` once per team (N re-reads and re-rankings per load, uncached). Add a batched roster read or cache it.
- **m5** `analyzer.tsx:131-136`: auto-evaluate on mount filters invalid ids but leaves the URL unchanged; mirror once when they differ.

## Nit
- **n1** `analyzer.tsx:136` empty-deps `useEffect`: prefer an explicit lint-disable comment with the reason.

## Checks passed
Weather context only (attached after optimizer and sim; no `impact`); synthesized `unavailable` window rule; matchup hash includes weather run time; analyzer request building, stale-response guard, URL mirroring, zod-validated responses, retry and live region, 3-per-side cap enforced three ways, IR/Taxi marked; reason-chips `code:index` keys; nav; Auto toggle selection and links; analyzer imports types only from shared; no skip/only/any; trades test asserts no em dash.
