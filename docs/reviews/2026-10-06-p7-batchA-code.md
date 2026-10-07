# Code review: Phase 7a Batch A plus P7.5

Date: 2026-10-06 | Diff: `main...5080504` (P7.2 e4fa039, P7.1 30e45e4, P7.5 1e9fa59, P7.3 5080504), excluding docs and fixtures
VERDICT: CHANGES REQUIRED

## Findings and disposition

| ID | Sev | Where | Finding | Disposition |
|---|---|---|---|---|
| M1 | Major | `apps/worker/src/jobs/player-news-job.ts`, `packages/providers/src/espn-news.ts` | No circuit breaker: an ESPN outage makes up to 60 calls x 10 s timeout, delaying the sequential "all" run and holding the lease; 429 keeps being hit | P7.5b (sleeper-data-engineer) |
| M2 | Major | `e2e/players.spec.ts:111-119` | Edited by frontend in P7.3; `e2e/` is qa-owned | Accepted as a necessary behavior update (assertions added, none removed); qa-engineer re-verifies in P7.7. P7.1's `packages/shared` and P7.5's `packages/sleeper` edits were within their briefs' scope |
| m1 | Minor | `espn-news.ts` `cleanSummary` | Only `&#39;` decoded among numeric entities | P7.5b |
| m2 | Minor | `player-news-job.ts` `forPlayer` | Per-player feed items attributed to the requested player even when ESPN tags others | P7.5b |
| m3 | Minor | `player-news-job.ts` `byEspn` | Duplicate espn ids: last wins silently | P7.5b |
| m4 | Minor | `sync-bookkeeping.ts` | Targeted requests uncapped across players | P7.4 (cap 20 pending, validate player exists) |
| m5 | Minor | `components/player-modal.tsx` | Focus return may fail in Safari (links not focused on click) | P7.6 plus P7.7 e2e |
| m6 | Minor | `@modal/(.)players/[playerId]/page.tsx` | `notFound()` in the slot gives a dead click | P7.6 ("Player not found" dialog) |
| n1 | Nit | `player-news-job.ts` | Unneeded `as string` cast | P7.5b |

## Verified OK (reviewer)

Fixture mode never hits the network; migration 0002 is additive; espn_id COALESCE keeps stored ids; news URLs http(s) only and HTML stripped; stretched-link pattern sound; intercepting route structure correct; per-run cap, shared limiter, idempotent upsert and prune in place.
