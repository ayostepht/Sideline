# Code review: Phase 7b Batch 3 (P7b.5, P7b.6, P7b.7)

Date: 2026-10-07 | Diff: `cffc00f..830f9d6` (docs excluded) | Reviewer: code-reviewer
VERDICT: CHANGES REQUIRED (2 Major)

## Major
- **M1** `packages/core/src/trade/evaluate.ts:68,77,85`, surfaced by `apps/web/lib/server/trades.ts` `impact()` and top-level reasons: `TRADE_ENTERS_LINEUP`, `TRADE_LEAVES_LINEUP`, `TRADE_AUTO_DROP` labels embed raw player ids ("4881 joins the best lineup"). Fix: relabel server-side after `refsFor` by code using player names; keep `value` as the id; cover evaluate and finder; test that no label contains a bare id. Routed to P7b.7f.
- **M2** `trades.ts` `impact()` and `findTradesForLeague`: suggestions past the top 10 get `playoff=null` and the "no regular-season games left or playoff setup unknown" reason, which is false for them. Fix: distinct not-computed state with an honest reason (or none). Routed to P7b.7f.

## Minor
- **m1** `trades.ts` `finderHash` and `roster-strength.ts` `getTradeTeams` hash omit the `leagues` and `players` syncs (playoff settings, roster positions, fantasy positions, names). Add both `lastSuccessAt`. P7b.7f.
- **m2** `trades.ts` `playoffContext`: baseline playoff sim recomputed on every evaluate and finder call. Cache it with the same hash. P7b.7f.
- **m3** `lineup.ts` <-> `matchup.ts` import cycle: safe today (call-time use only), fragile later. Move shared readers to `lineup-inputs.ts`. P7b.7f.
- **m4** `packages/providers/src/open-meteo.ts`: every HTTP 400 maps to `out_of_range`, hiding real request bugs from the failure cap. Map to `out_of_range` only when the date is out of range; else `network`/`bad_request`. P7b.6f.
- **m5** `weather-job.ts`: games skipped after the failure cap or an abort get no row. The UI and server must treat a missing row as "No forecast". Routed to P7b.9 and P7b.11 briefs.

## Nit
- **n1** `readOutdoorGamesBetween` lexicographic compare at the upper bound (already in the PROGRESS backlog).
- **n2** past game clock with real network sends past-date requests; dev only, handled.

## Checks passed
Auto boundaries, fallbacks, no stale resolved mode, no feedback loop; playoff "before" equals league-intelligence (shared builder, same seed, consistent divisor); taxi and IR as reserve; 400/404 mapping; weather job clocks, keep-row logic, failure cap, pacing, deterministic fixture weather; no skipped or weakened tests.
