# Code review: fix/news-ids (2026-10-07)

Reviewer: code-reviewer. Scope: d92fa34 NEWS-IDS-1, f34fcf8 NEWS-IDS-2, e690479 NEWS-IDS-3, 95fd5a3 OPP-1 (excluding docs and UI).

VERDICT: CHANGES REQUIRED (one Major)

## Findings
- **[M1] Major**: `apps/worker/src/jobs/data-jobs.ts:57-64`. The players-guard bypass has no cooldown. If Sleeper keeps returning no ESPN ids, every manual, web-enqueued or catch-up `players` run refetches `/players/nfl`. That breaks the once-a-day rule. Fix: only bypass after a minimum interval (e.g. 6h). Add a test: two consecutive runs with zero ids cause one fetch.
- **[m1] Minor (promoted to fix now)**: `packages/providers/src/player-ids.ts:78-85`. Conflicts are checked only in the sleeper->espn direction. Two sleeper ids sharing one espn id are both kept, so one player would show another player's news. Fix: drop every sleeper id whose espn id is shared.
- **[m2] Minor**: `fillMissingEspnIds` does not check that the espn id is unused by another player (defense in depth for m1).
- **[m3] Minor (fixing now)**: `player-ids.ts:30-36`. The gzip fetch wrapper copies the original headers (content-length/encoding) onto the new body. Keep only last-modified and etag.
- **[m4] Minor**: `apps/web/lib/server/next-opponents.ts:63-65`. A null `kickoff_utc` keeps a played game as "next" until the week rolls over.
- **[m5] Minor**: `next-opponents.ts:73`. After week 18 the list is empty with no reason. Suggest "Season complete". Grades use the latest DvP snapshot for all four weeks, consistent with lineup.ts.
- **[n1] Nit**: `next-opponents.ts:62` comment wording about bye weeks.

## Clean
Zod parsing and header check, the provider never throws, the job degrades to a skip, player_ids runs before player_news, ownership respected, `now` injected (ADR-019).

## Disposition
M1, m1 and m3 go to sleeper-data-engineer (NEWS-IDS-4). m2, m4, m5 and n1 go to the backlog.
