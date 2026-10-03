# Progress

## Phase status

| Phase | Gate | Branch | Status |
|---|---|---|---|
| 0 Bootstrap and API spike | G0 | `phase/0-bootstrap` (merged) | Done, G0 PASS 2026-10-01 |
| 1 Data layer and sync | G1 | `phase/1-data` (merged) | Done, G1 PASS 2026-10-02 |
| 2 App shell and league views | G2 (human) | `phase/2-shell` (merged) | Done, G2 PASS 2026-10-02 (Steph approved) |
| 3 Scoring, projections, optimizer | G3 (human) | `phase/3-scoring` (merged) | Done, G3 PASS 2026-10-03 (Steph approved) |
| 4 Waivers, players, Docker beta | G4 (human, optional) | `phase/4-waivers` | Done, G4 PASS 2026-10-03 (human checkpoint optional, awaiting Steph's reply, not blocking Phase 5) |
| 5 Matchups and league intelligence | G5 | | Not started |
| 6 Hardening and v1.0 | G6 (human) | | Not started |

## Resume point

See `docs/HANDOFF.md` (the single source for resuming after a session limit or `/clear`).

## Earlier phases

Phase 0 and 1 task tables and the pre-triage backlog are in `docs/archive/progress-phase0-1.md`; Phase 2 in `docs/archive/progress-phase2.md`; Phase 3 (task table, G3 phase checks, full backlog-as-of-gate) in `docs/archive/progress-phase3.md`; Phase 4 (task table, live fixes, gate-time fixes, G4 phase checks) in `docs/archive/progress-phase4.md`. Standing rules for briefs are in `docs/brief-rules.md`.

## Backlog (open items only)

Remove an item when it is done; the archive keeps history.

### Carried from Phase 2

- **Phase 3 design follow-ups (Steph, G2):** scoreboard hero on Home and My Team (large tabular Record, PF, Rank strip); lime on one content item per page (top recommendation). Home standings snippet "You" should use the purple badge like League. Settings route JS 169,200 B of the 170 KB target (800 B headroom); `/dev/gallery` 193,866 B of the 200 KB budget.
- **Frontend:** player-row primitive caps at `md:max-w-2xl` for other consumers; desktop header shows "League" briefly before the team name hydrates; dark your-row purple bar is 2.52:1 against accent-soft (fine against the ground, You badge carries text); missing `favicon.ico` (with the PWA work); not-found page has no h1 (add `level` prop to `EmptyState`) and no app chrome; every StaleBanner renders its own Sync now; Suspense fallback may shift layout; no shared Input/Select; reserve a stat slot in roster rows (Phase 3 points); Settings cannot re-run setup for the same username (consider "Re-check my account"); "Still syncing" has no auto refresh; layout DB-error catch and `app/error.tsx` untested at runtime; `lib/client/api.ts` imports schemas from `app/onboarding/_components/schemas`; overlay fade under reduced motion.
- **Backend:** G2 code review minors (`docs/reviews/2026-10-02-G2-code.md`): `startOnboarding` writes in one immediate transaction; seed env identity once at boot rather than on GET; zod or column test for `league-views.ts` row casts; cache the player-search owner map if profiles show it; shared response schemas for `/api/onboarding/league` and `PATCH /api/settings`; a route-listing test that every mutating route uses `guardedWrite`. After a Settings league switch, `/onboarding` has no `syncSince`. Client schemas import shared by deep path (consider `@sideline/shared/schemas`).
- **Worker:** an invalid configured username makes one failing user-id lookup per cycle (G2-B1).
- **Tests (qa-engineer):** e2e for `header-title-mobile`, `settings-sync-info`, the desktop "League / <team>" label; gallery states not asserted one by one; NAV-6 mocks the league-switch POST (real switch and "Still syncing" not in e2e); stale and preseason states not in e2e; two-fast-clicks week path has no e2e; not-found tests are skipped when a main-suite test fails (Playwright dependencies) and must be stressed with `--workers=1`; TEAM-3 option (a), a server-side pre-check, remains possible if the flake ever matters outside tests.
- **Tooling (devops-engineer):** `geist` dependency unused; `.playwright-mcp/` not in `.gitignore`; `pnpm screens` cannot capture 404 routes; two `start-standalone.mjs` at once race on copying `.next/static`; temp seeded DATA_DIRs are never cleaned up; `scripts/lib/seed.ts` may not forward `--no-identity`; `next/font/google` needs network at build time (works in Docker today).

### Data and backend

- **G2 code review minors (backend-engineer, `docs/reviews/2026-10-02-G2-code.md`).** m1 wrap `startOnboarding` writes in an immediate transaction; m2 seed env identity once at boot instead of on GET (busy_timeout already set); m3 zod or column test for `league-views.ts` row casts; m4 cache the player-search owner map if profiles show it; shared response schemas for `/api/onboarding/league` and `PATCH /api/settings`; a route-listing test that every mutating route uses `guardedWrite`.

- Raw SQL to `@sideline/db` helpers: apps/web reads (`h.sqlite.prepare`), worker `failUnknownJobs` and `seedLastAttempts`, `requestSyncForLeagueChange` (add `enqueueFresh`). Make `claimNext`/`toRequest` tolerant of unknown jobs, then drop the worker's raw UPDATE.
- `rosters` has no division column, so standings `division` is always null (migration plus worker mapping).
- Non-ASCII player search (normalized search name). PATCH settings schema is local to apps/web, not shared.
- Share the "No Sleeper user with that username" text as a constant between worker and web.
- Onboarding jobs write no `sync_runs` rows (`latestRunPerJob`/`startRun` are SyncJobName-only). `RawLeagueSchema` has no `avatar`.
- Degraded nflverse is stored as `skipped` (no `degraded` status, no note column). `league_player_week_points` and `defense_vs_position` not in `JOB_TABLES` (T3.2).
- packages/db: declare zod and tsx; `cli/migrate.ts` has no unit test.
- `SIDELINE_VERSION` must track the package version; consider `etag: false` for regular stats and projections (keeps multi-MB bodies out of http_cache).

### Worker and providers (sleeper-data-engineer)

- **No worker job ever calls `upsertUsageWeek` (found by T4.5b, confirmed by the orchestrator via `grep -rn "upsertUsageWeek" apps/worker/src/`: zero hits outside tests).** `packages/providers/src/usage.ts`'s `joinUsage` already computes Sleeper-matched usage rows from nflverse data, but `apps/worker/src/jobs/data-jobs.ts`'s `nflverseJob` never persists them to the `usage_week` table. Practical effect on real data: TREND-2 (usage trend) and T4.5b's usage-trend Waiver Score component silently fall back to a scoring-trend proxy for every player, all the time, not just when nflverse is disabled. Needs a worker-job fix (sleeper-data-engineer) wiring `joinUsage`'s output into `upsertUsageWeek`, ideally before Phase 4 closes since it affects two features this phase shipped.

- p1 Batch B m2, m3, m7: providers cache meta zod, atomic cache writes, season_type filter; m5 stats rows without gp are did-not-play (T3.1); m6 document starters "0" as an empty slot.
- p1 Batch E m1 to m4: `storeState` in one transaction; recompute changed tables includes failed jobs with rowsChanged > 0; zod for the fixture manifest; test that a real gametime replaces an approximate kickoff.
- T1.5c: compute the ADR-002 fallback kickoff when gametime is missing; with nflverse off no fallback rows exist.
- T1.4a m6/m8: nflverse recorder `--refresh`, size check, fetch timeout, zod for release JSON, write-then-swap.
- Injectable `sleep` in `makeClient` (sturdier backoff tests; the 503 retry test takes about 4 s). apps/worker has no `test` script (devops).

### Carried from Phase 4

Full detail and fully-fixed history: `docs/archive/progress-phase4.md`.

- Waivers' "Suggested drop" shows the identical player across most candidates (correct -- always the lowest ROS-value bench player, independent of position) with no inline cue it's intentional; only explained one click deep in the "Why?" sheet. Consider an inline qualifier like "Suggested drop (lowest value overall): ...".
- Fullback-position players render with a generic "FLEX" badge (pre-existing `PositionBadge`/`normalizePosition` fallback, not introduced by Phase 4, now visible since Players surfaces the full player pool).
- No per-week matchup grades for waiver candidates (`WaiverCandidateSchema` only has one schedule percentile folded into a Waiver Score reason); T4.6a shows one aggregate grade instead of three. Backend-engineer follow-up if per-week grades are wanted on Waivers.
- Players list has no "rostered by / free agent" field (unlike the search endpoint's `PlayerSearchResult.owner`) and no ROS value at list scope (by T4.5c's own documented design, deferred to keep the list fast); player detail has no forward schedule/opponent data, so T4.6b shows "not available yet" for "next 4 opponents" instead of fabricating it.
- `WAIVER_SCORE_*` reasons' `impact` is a 0-100-scale weighted-score contribution, not fantasy points, but `formatImpact` renders it identically to real point impacts elsewhere ("+40.0 pts") -- could misread as a fantasy-points claim in the Waiver Score breakdown sheet. Candidate reason-format.ts follow-up (and/or a per-reason-code formatting hint).
- `data-testid="waivers-row"` is shared by both the card and table DOM nodes (only one visible per breakpoint via CSS), unlike `players-row`/`players-table-row`'s distinct ids -- a future e2e test must scope within `waivers-table`/`waivers-cards` or assert `toBeVisible()`, not just count matches.
- `packages/core/package.json` has no `"test"` script (only `"typecheck"`), so `pnpm --filter @sideline/core test` silently no-ops instead of erroring (devops-engineer).
- **T4.3 Docker image size is ambiguous: `docker images` reports 551 MB, but the `CONTENT SIZE` column (unique layers added by this repo's Dockerfile, excluding the shared base image) is ~124-130 MB (G4: 123.6 MB arm64, 124.4 MB amd64)** -- the latter is the number directly comparable to G1-G3's ~100.8 MB web-only figure. T6.2 (HOST-5, 400 MB budget, multi-arch CI) must settle on one measurement method before enforcing the budget; `better-sqlite3` prebuilds and `sharp` are still untrimmed.
- `apps/web/lib/server/lineup.ts`'s private `readPlayers`/`readRoster` duplicate logic now available as `packages/db`'s `readPlayers`/`readRosteredPlayerIds` (T4.5a) -- a future cleanup could switch `lineup.ts` over.
- **`getPlayerDetail` costs ~125-127ms/call at a realistic week-17/1,000-player seed, confirmed stable (not worse) through the G4 gate, versus under 1ms for every other data function.** Home's `getPlayerDetail` x16 loop totals ~2.0-2.7s, under the 4,800ms budget but a real, worsening-with-the-season cost on the highest-traffic page. No `computed_cache` entry exists for `getPlayerDetail`/`getPlayersList` yet. Candidate for backend-engineer: a `computed_cache` entry, or caching `readLeagueWeekPositionRanks`/`readUsageWeek` per (league, season, week) instead of recomputing per player.
- T4.8b's `PRIORITY_VALUE_BREAKDOWN` reason dropped its formula breakdown from `label` (now a short one-line summary) in favor of short chip copy; the numeric inputs (`positionFactor`/`weeksFactor`/`valueOfPriority`) are still on `ClaimAdviceResult` for a future render if Steph wants the detailed math visible.
- T6.2 follow-ups from T4.3: `packages/shared`'s `AppConfigSchema.puid`/`pgid` (default 1000/1000) are unused by any code path and now inconsistent with the container's real 99/100 default (backend-engineer: wire them to something real or align the default); a bare `docker exec <c> whoami` returns `root` by design -- gate verification scripts must use `docker top` or `docker exec -u <uid>:<gid>`, not `whoami`, to check non-root; PUID/PGID chown was verified on a named Docker volume and a real Linux host, not a macOS bind mount. No `SIGTERM`/`SIGINT` trap in the entrypoint (hard kill instead of graceful drain on `docker stop`); unconditional `chown -R` on every boot instead of only when ownership is already wrong.
- **G4 gate code review (m3):** `apps/web/lib/server/waivers.test.ts`'s only end-to-end `nextClearAt` assertion for T4.9's DST fix uses a January (EST) date, so the DST branch itself isn't exercised at the web-integration layer (only at `packages/core`'s unit/golden level, which is thorough). Low risk, candidate qa-engineer follow-up: add an EDT-dated integration case.
- **Route JS over the 170,000 B soft target (all under the 204,800 B hard budget), confirmed at the G4 gate:** Lineup 178,893 B, Waivers 191,364 B, Players list 178,260 B, Players detail 193,914 B (least headroom, ~5.3%). Worth revisiting the soft target's realism for feature-dense routes if Phase 5 adds more client code to any of these.

### Tests and tooling

- tests/fixtures/README.md: extra manifest keys, fake id ranges, short-name word-boundary rule, Lighthouse script-size unit (qa).
- p1 Batch F m1 iteration guard in `drive()`; m2 RATE-1 comment. p1 Batch D m7 contract suite header comment (qa).
- `pnpm gate --only=...` overwrites `latest.json` (write `latest.partial.json`); UI3 should wait for port 3000 to be released (devops).
- `reuseExistingServer: !CI` can reuse a stale local server (qa).
- CONTRACT_PLAYERS=1 widens the contract include; CONTRACT-3 body not run live yet.
- `pnpm fixtures:check` needs the raw cache or live API, so it can't run in CI; the orchestrator runs it at commits touching fixtures and at gates.
- Fixtures 5.6 MB of a 6 MB target: re-record with trimming, not growth.
- pnpm peer-dependency warning on install not investigated; @types/better-sqlite3 9.6.0 may lag v13.

### Carried from Phase 3

Full detail and fully-fixed history: `docs/archive/progress-phase3.md`.

- `scheduleAlreadyStored` (`apps/worker/src/jobs/data-jobs.ts`) uses a raw SQL query instead of a typed `packages/db` helper, inconsistent with its siblings `readStoredStatsWeeks`/`readStoredProjectionWeeks`.
- Three UX Minors (deferred by Steph): Lineup's summary banner says "projected" even in Safe/Upside mode; its rounded total can disagree with its own swap rows (e.g. a signed "-0.0 pts") with no zero-delta floor like Home's `hasSwaps` guard; "this is your team" uses two different badge variants on the same Home page (`variant="accent"` vs `variant="you"`) -- standardize on `variant="you"`.
- `packages/db`'s `computed_cache` keys only on data-input timestamps, never algorithm version, so a running instance could keep serving a pre-fix cached lineup until the next relevant sync. Related: the lineup cache (`getLineup`, T3.7) doesn't invalidate on an nflverse-only sync (ADR-013 item 19) -- zero impact today since alpha/beta is confirmed 0 by the real G3 backtest; revisit together if a future backtest ever ships non-zero alpha/beta.
- Low-priority, pre-existing, not blocking: `matchupMultiplier`'s own clamp/avg-unavailable reasons aren't surfaced in the player DTO; a `schedule` coverage gap for a team/week silently reads as "not locked"; a player missing from `players` or a zero-eligible-player roster are handled defensively but untested; `applyAvailability` runs twice with identical inputs; `matchupGrade` has no `totalTeams === 0` guard; `defense_vs_position`'s worker hook recomputes every week from scratch (O(W^2), negligible at NFL scale); `solve.ts`'s `TIEBREAK_EPSILON` undocumented at unrealistic magnitudes; `validate.ts` reads one player-week at a time (fine for a manual script); `rescoreProjection`'s `stats` parameter has no nominal type separating a projection row from a real stats row.

### Later phases

- T3.5 and T4.1 own the real `gradeFromScore` and `trendFromDelta` thresholds (placeholders now). No testing-library/jsdom: components have mapping tests only.
- T4.3: supervisor starts the worker, runs migrations, PUID/PGID 99/100; worker container inherits NODE_ENV=production; trim better-sqlite3 prebuilds and sharp; revisit health (stale heartbeat fails the healthcheck).
- T4.x auth refuses to start with an empty SESSION_SECRET or APP_PASSWORD.
- T6.2: remove the next@16.3.8 `minimumReleaseAgeExclude`. T6.3: themeColor vs the in-app theme toggle.
- P1: nflverse play-by-play for red-zone touches (TREND-2).

## Questions for Steph

- **G4's 4 questions, sent 2026-10-03, reply pending (optional checkpoint, not blocking Phase 5):** does Waivers' recommendations/claim advice match her own read this week; does the now-DST-corrected clear time match what she's actually seen Sleeper do; look and feel of Waivers/Players approved as is or changes wanted before Phase 5; approve the already-completed merge to `main` and tag `gate-G4`. See `docs/gates/G4.md`'s Human checkpoint section.
- Earlier, all answered: G2 (2026-10-02: ADR-011, ADR-012, final approval). G3 (2026-10-03: lineup recommendation and look/feel approved; wanted more detail in the "why" -- done in T4.8a/b/c; three Minor UX findings deferred; approved merge and tag `gate-G3`).
