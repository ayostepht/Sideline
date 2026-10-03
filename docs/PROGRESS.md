# Progress

## Phase status

| Phase | Gate | Branch | Status |
|---|---|---|---|
| 0 Bootstrap and API spike | G0 | `phase/0-bootstrap` (merged) | Done, G0 PASS 2026-10-01 |
| 1 Data layer and sync | G1 | `phase/1-data` (merged) | Done, G1 PASS 2026-10-02 |
| 2 App shell and league views | G2 (human) | `phase/2-shell` (merged) | Done, G2 PASS 2026-10-02 (Steph approved) |
| 3 Scoring, projections, optimizer | G3 (human) | `phase/3-scoring` | Next: plan batches (not started) |
| 4 Waivers, players, Docker beta | G4 (human, optional) | | Not started |
| 5 Matchups and league intelligence | G5 | | Not started |
| 6 Hardening and v1.0 | G6 (human) | | Not started |

## Resume point

See `docs/HANDOFF.md` (the single source for resuming after a session limit or `/clear`).

## Phase 3 task table

Split per ADR-013. Batches run in order A to G; tasks in the same batch run in parallel (disjoint files, no dependency on each other's output).

| ID | Title | Agent | Depends | Batch | Status | Attempts | Commit |
|---|---|---|---|---|---|---|---|
| T3.1 | Scoring engine (SCORE-1, SCORE-3) and validation harness (SCORE-2) with report | analytics-engineer | G2 | A | Done | 1 | 4a73f30 |
| T3.2a | `packages/db` upsert helpers for `league_player_week_points`, `defense_vs_position` | backend-engineer | G2 | A | Done | 1 | 22d3630 |
| T3.2c | `packages/db` read helpers: `player_week_stats`, `player_week_projections`, `leagues` content | backend-engineer | G2 | B | Done | 1 | 91a2b78 |
| T3.3a | Projections part 1: PROJ-1 base rescore, PROJ-4 rest-of-season | analytics-engineer | T3.1 | B | Done | 1 | 104f08d |
| T3.4a | Optimizer part 1: Hungarian solver, slot and eligibility resolution (LINEUP-1, 2, 9) | analytics-engineer | T3.1 | B | Done | 1 | ed071b4 |
| T3.2b | Worker recompute hook materializing `league_player_week_points` after sync | sleeper-data-engineer | T3.1, T3.2a, T3.2c | C | Done | 1 | 749388e |
| T3.3b | Projections part 2: PROJ-2 variance and shrinkage, PROJ-3 floor and ceiling | analytics-engineer | T3.3a | C | Done | 1 | e26905e |
| T3.4b | Optimizer part 2: locks, availability, modes, reasons and issues output, perf (LINEUP-3 to 7) | analytics-engineer | T3.4a | C | Done | 1 | 160810e |
| T3.5a | Matchup core: MATCH-1 DvP, MATCH-2 multiplier, MATCH-4 grade (alpha/beta default to 0/0) | analytics-engineer | T3.2b, T3.3b | D | Done | 1 | 0f42b67 |
| T3.6 | Golden optimizer scenarios (12+) and property tests (1000+ runs, LINEUP-8) | qa-engineer | T3.4b | D | Done | 1 (+2 fix rounds) | d2550d4, fixes 6137927 |
| T3.2e | `packages/db` read helpers: `players` (team/position), `schedule`, `league_player_week_points` content | backend-engineer | G2 | E | Done | 1 | edc3057 |
| T3.5c | MATCH-3 backtest harness: grid-search alpha/beta, update T3.5a's constant if it clears the 1% MAE bar, report | analytics-engineer | T3.5a | E | Done | 1 | e022826 |
| T3.5b | Worker recompute hook materializing `defense_vs_position` (calls T3.5a) | sleeper-data-engineer | T3.5a, T3.2a, T3.2e | F | Done | 1 | c3ba684 |
| T3.7 | Lineup data function and API with caching | backend-engineer | T3.4b, T3.5b | G | Done | 1 | 5870660 |
| T3.8a | Lineup page | frontend-engineer | T3.7 | H | Not started | 0 | |
| T3.8b | Home "This week" lineup issues card; carried Phase 2 design backlog (scoreboard hero, lime accent, You badge, roster stat slot) | frontend-engineer | T3.7 | H | Not started | 0 | |
| T3.9 | E2E lineup flow (mode toggle, swaps, Open in Sleeper, opponent view) | qa-engineer | T3.8a, T3.8b | I | Not started | 0 | |

**G3 phase checks:** SCORE-2 at least 99% match on Steph's real league; golden and property tests pass; LINEUP-7 benchmark passes; backtest report exists and the alpha/beta decision is logged. Human checkpoint: Steph compares this week's recommended lineup and reasons to her own judgment.

## Earlier phases

Phase 0 and 1 task tables and the pre-triage backlog are in `docs/archive/progress-phase0-1.md`; Phase 2 in `docs/archive/progress-phase2.md`. Standing rules for briefs are in `docs/brief-rules.md`.

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

- p1 Batch B m2, m3, m7: providers cache meta zod, atomic cache writes, season_type filter; m5 stats rows without gp are did-not-play (T3.1); m6 document starters "0" as an empty slot.
- p1 Batch E m1 to m4: `storeState` in one transaction; recompute changed tables includes failed jobs with rowsChanged > 0; zod for the fixture manifest; test that a real gametime replaces an approximate kickoff.
- T1.5c: compute the ADR-002 fallback kickoff when gametime is missing; with nflverse off no fallback rows exist.
- T1.4a m6/m8: nflverse recorder `--refresh`, size check, fetch timeout, zod for release JSON, write-then-swap.
- Injectable `sleep` in `makeClient` (sturdier backoff tests; the 503 retry test takes about 4 s). apps/worker has no `test` script (devops).

### Tests and tooling

- tests/fixtures/README.md: extra manifest keys, fake id ranges, short-name word-boundary rule, Lighthouse script-size unit (qa).
- p1 Batch F m1 iteration guard in `drive()`; m2 RATE-1 comment. p1 Batch D m7 contract suite header comment (qa).
- `pnpm gate --only=...` overwrites `latest.json` (write `latest.partial.json`); UI3 should wait for port 3000 to be released (devops).
- `reuseExistingServer: !CI` can reuse a stale local server (qa).
- CONTRACT_PLAYERS=1 widens the contract include; CONTRACT-3 body not run live yet.
- `pnpm fixtures:check` needs the raw cache or live API, so it can't run in CI; the orchestrator runs it at commits touching fixtures and at gates.
- Fixtures 5.6 MB of a 6 MB target: re-record with trimming, not growth.
- pnpm peer-dependency warning on install not investigated; @types/better-sqlite3 9.6.0 may lag v13.

### Phase 3: scoring, projections, optimizer

- T3.7 code review (`docs/reviews/2026-10-02-p3-t37-code.md`, ADR-013 item 20): one Major (currentAssignment could misalign with resolveSlots on an unknown slot type, fixed commit 438ffdd). Open minors: `matchupMultiplier`'s own clamp/avg-unavailable reasons aren't surfaced in the player DTO (inconsequential while alpha/beta are 0); a `schedule` coverage gap for a team/week silently reads as "not locked" (pre-existing); a player missing from `players` or a zero-eligible-player roster are handled defensively but untested; `applyAvailability` runs twice with identical inputs (redundant, not a correctness bug).
- **Lineup cache (`getLineup`, T3.7) doesn't invalidate on an nflverse-only sync (ADR-013 item 19).** Zero impact today since the matchup multiplier is a no-op (alpha/beta default 0); add `nflverse`'s `lastSuccessAt` to `inputsHashFor` in `apps/web/lib/server/lineup.ts` once T3.5c's real backtest ships a non-zero alpha/beta.
- **T3.6's property suite found two real bugs within its first run, both fixed same-day (ADR-013 item 14).** A locked current starter could be double-booked into a second eligible slot (`recommendLineup` excluded a locked player from the solver pool only when they weren't a current starter; fixed by excluding every locked player, commit 6137927). The property test's own `genAlternativeLineup` comparison generator had the identical bug class in its baseline-building logic, producing a false failure; fixed in the same style (commit d2550d4). Worth remembering as a model case for why LINEUP-8's property suite exists.
- Batch D-F code review (`docs/reviews/2026-10-02-p3-batchDEF-code.md`, ADR-013 item 17): one Major (non-deterministic stats-source precedence in two DvP joins, fixed commit c2c6da2), both ratified ownership notes logged (ADR-013 items 16-17). Open minors: `matchupGrade` has no `totalTeams === 0` guard (unreachable today, every caller passes 32); `defense_vs_position`'s worker hook recomputes every week from scratch each run (O(W^2), negligible at NFL scale).
- Batch A-C code review (`docs/reviews/2026-10-02-p3-batchABC-code.md`, ADR-013 item 12): one Blocker (optimizer could silently recommend an unavailable player, fixed commit 23bcad0) and one Major (embedded NUL byte in `league-points.ts`, fixed commit 346297d), both fixed and re-verified (`pnpm verify` 862 tests) before Batch D. Minor/informational items left open: `solve.ts`'s `TIEBREAK_EPSILON` undocumented at unrealistic (~1e15) value magnitudes; `scripts/validate-scoring/validate.ts` reads one player-week at a time rather than batch-reading (fine for a manual gate script, not a pattern for hot-path code); `rescoreProjection`'s `stats` parameter has no nominal type separating a projection row from a real stats row (no live bug, one correctly-scoped caller today).

### Later phases

- T3.5 and T4.1 own the real `gradeFromScore` and `trendFromDelta` thresholds (placeholders now). No testing-library/jsdom: components have mapping tests only.
- T4.3: supervisor starts the worker, runs migrations, PUID/PGID 99/100; worker container inherits NODE_ENV=production; trim better-sqlite3 prebuilds and sharp; revisit health (stale heartbeat fails the healthcheck).
- T4.x auth refuses to start with an empty SESSION_SECRET or APP_PASSWORD.
- T6.2: remove the next@16.3.8 `minimumReleaseAgeExclude`. T6.3: themeColor vs the in-app theme toggle.
- P1: nflverse play-by-play for red-zone touches (TREND-2).

## Questions for Steph

- None open. (G2 answered 2026-10-02: ADR-011, ADR-012, final approval.)
