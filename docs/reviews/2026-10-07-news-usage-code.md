# Code review: fix/news-usage (2026-10-07)

Reviewer: code-reviewer. Scope: `git diff main...fix/news-usage` excluding docs (528915f NEWS-KIND-1, 72800ba FIX-SYNC-USAGE, 3601c36 NEWS-UI, ec160e1 NEWS-KIND-2).

VERDICT: CHANGES REQUIRED (one Major)

## Findings

- **[M1] Major**: `apps/worker/src/jobs/player-news-job.ts:56-61` and `packages/db/src/upserts.ts:646-690`. The "never downgrade note to article" guard only works inside one run's in-memory Map. Suppose the recent feed carries the same story id as an article and the player is not in this run's slice. The upsert then overwrites the stored note, cuts the summary back to 400 chars, and makes the "Latest" block disappear. Fix: enforce it in the DB upsert, so an incoming article never replaces a stored note's kind or summary. Add a cross-run test.
- **[m1] Minor**: `apps/worker/src/jobs/data-jobs.ts:250-290`. If 2025 usage stays empty (nflverse down, or a zero-row join), every backfill run re-reads the players table and re-parses the cached CSVs. It reports "ok" instead of "skipped". There is no extra network cost (cached). Fix: add a cooldown or a terminal state, plus a test for the case where usage stays empty.
- **[m2] Minor**: `data-jobs.ts:250` `countRows` and `nflverse-job.ts:96` `readPlayerRefs` use raw `sqlite.prepare` with `as` casts in the worker. Move them to `packages/db/src/sync-reads.ts` helpers.
- **[m3] Minor**: `packages/providers/src/espn-news.ts:132-137`. The `max * 0.6` word-boundary threshold is an unnamed magic number.
- **[m4] Minor**: `data-jobs.ts:38-42`. A 20h guard allows two `/players/nfl` fetches within 24h when a manual run happens 20h before the cron. Document it, or guard on calendar day plus jitter.
- **[m5] Minor**: Migration 0004. Pre-existing news rows stay 'article' with 400-char summaries until refetched. Acceptable.
- **[n1] Nit**: `apps/web/lib/server/players.ts:244` silently maps unknown kinds to 'article'. Prefer `PlayerNewsKindSchema.catch("article")`.

## Checked OK
XSS (text-only rendering; URLs sanitized), toggle a11y (button, aria-expanded/controls, 44px), no network inside transactions, `syncUsageForSeason` never throws, edited tests legitimate (not weakened), ownership respected.

## Disposition
M1 is sent to backend-engineer as NEWS-KIND-3. m1 to m4 and n1 go to the PROGRESS.md backlog. m5 is accepted.
