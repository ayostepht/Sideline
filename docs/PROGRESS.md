# Progress

## Phase status

| Phase | Gate | Branch | Status |
|---|---|---|---|
| 0 Bootstrap and API spike | G0 | `phase/0-bootstrap` (merged) | Done, G0 PASS 2026-10-01 |
| 1 Data layer and sync | G1 | `phase/1-data` (merged) | Done, G1 PASS 2026-10-02 |
| 2 App shell and league views | G2 (human) | `phase/2-shell` | In progress (plan approved 2026-10-02, ADR-009) |
| 3 Scoring, projections, optimizer | G3 (human) | | Not started |
| 4 Waivers, players, Docker beta | G4 (human, optional) | | Not started |
| 5 Matchups and league intelligence | G5 | | Not started |
| 6 Hardening and v1.0 | G6 (human) | | Not started |

## Resume point

See `docs/HANDOFF.md` (the single source for resuming after a session limit or `/clear`).

## Phase 2 tasks

| ID | Title | Agent | Batch | Status | Attempts | Commit |
|---|---|---|---|---|---|---|
| T2.B0 | Branch, ADR-009, PLAN amendments, tracking docs | orchestrator | 0 | Done | 1 | |
| T2.0 | UI dependency preinstall, postcss config | devops-engineer | A0 | Done (route JS unchanged 131,641 B; image 105.2 MB, health 200 in 2 s) | 1 | 383678c |
| T2.1a | Design system part 1 and gallery | frontend-engineer | A | Done (`/` 133,517 B, gallery 183,470 B; AA contrast table in report) | 1 | d3527fa |
| T2.2a | Shared DTOs, job names, db migration and helpers | backend-engineer | A | Done (targeted checks; full verify before Batch B; db 96.1% lines) | 1 | 863b018 |
| T2.0b | Seeded screens/gate harness, screenshot guard, LAN dev, G1 backlog | devops-engineer | A | Done (refusals verified by orchestrator; its docs/self-hosting.md section landed in 17af2ce by an orchestrator `git add docs`) | 1 | 775680b |
| T2.2a-fix | Batch A review m4, m5, m6, m8, m9 (contracts) | backend-engineer | B1 | Done (targeted checks) | 1 | a4682f6 |
| T2.0b-fix | Batch A review m1, n1 (guard case, redaction) | devops-engineer | B1 | Done (targeted checks; full verify before B2) | 1 | e20055a |
| T2.1b | Design system part 2 (plus review m10) | frontend-engineer | B1 | Done (gallery 185,138 B; `/` 133,517 B) | 1 | c42b101 |
| T2.2b | Server data functions and route handlers | backend-engineer | B2 | Done (lib/server 98.2%, app/api 100% lines; p95 under 5 ms on a synthetic DB) | 1 | cfd1d59 |
| T2.2c | Worker onboarding jobs, active league, fixture fetch mode | sleeper-data-engineer | B2 | Done (worker 90% lines; deviation: onboarding writes no sync_runs row, the sync_requests row is the record) | 1 | 74ebc74 |
| T2.2b-fix | Batch B review M1 (league switch sync), m1, m2, m3, m5 | backend-engineer | B-fix | Done (targeted checks; 639 tests at agent run) | 1 | 18628a4 |
| T2.1c | Gallery UX review fixes M1, m1 to m6, n1, n2 plus code m7 | frontend-engineer | B-fix | Done (gallery 185,352 B) | 1 | 17cab8b |
| T2.3a | Layout shell, switcher, week selector, search, placeholders | frontend-engineer | C | Done (`/l/[leagueId]` 155.0 KB, `/` 136.6 KB; overlays and cmdk lazy) | 1 | 0a45a4a |
| T2.5a | QA harness (seeded e2e and Lighthouse, fixture worker; plus UX M2 gallery axe) | qa-engineer | C | Done (e2e 75, a11y 36 at agent run; full e2e re-run by orchestrator before Batch D) | 1 | 94a04f3 |
| T2.0b-fix2 | Route-size check on dynamic routes; screens slugs for query routes | devops-engineer | C | Done (`/` 139,863 B; `/l/*` 158,754 B; gallery 189,202 B) | 1 | 494e0bd |
| T2.3a-fix | Batch C review M1 (404 loop), M2 (layout errors), m1, m2, m3 | frontend-engineer | C-fix | Done (orchestrator: verify 662 tests, e2e 75, a11y 36 on the combined tree; `/l/[leagueId]` 161,611 B) | 1 | 2a08728 |
| T2.2b-fix2 | Batch C review m4, m5; getLeagueChoices tests | backend-engineer | C-fix | Done (lib/server and app/api 98.4% lines) | 1 | cfb098d |
| T2.3a-fix2 | Shell UX review M1 (768 layout, sidebar stays at 1024 per PLAN 6.3), M2 (desktop header title and week label), m1 to m4, n1 | frontend-engineer | C-fix | Done (orchestrator: verify 662, e2e 75; `/l/[leagueId]` 161,725 B) | 1 | 41fd0c1 |
| T2.3b | Onboarding and Settings v1 | frontend-engineer | D | Done (orchestrator: verify 676, e2e 75; /onboarding 154.6 KB, settings 164.3 KB) | 1 | 9490c57 |
| T2.3c | Home v1, League, team detail, My Team | frontend-engineer | D | Done (targeted checks; routes about 161.6 KB) | 1 | fbc6204 |
| T2.2d | Standalone server detects migrations without SIDELINE_MIGRATIONS_DIR | backend-engineer | D-fix | Done (503 not reproducible from the build checkout; root cause was a baked absolute path; now an embedded migrations manifest) | 1 | 7dc548f |
| T2.3b-fix | Batch D review M1 (syncSince, sent as follow-up), M2, M3, m1 to m9, n2 | frontend-engineer | D-fix | Done (orchestrator: verify 688, e2e 75; /onboarding 158,973 B, settings 168,563 B) | 1 | 20da03b |
| T2.2e | `syncSince` on POST /api/onboarding/league (Batch D review M1, server side) | backend-engineer | D-fix | Done (77 tests; coverage confirmed at the next full coverage run) | 1 | 06a5188 |
| T2.2f | Fixture seed stores the fixture user identity, league choices, active league (`--no-identity` keeps anonymous) | sleeper-data-engineer | E0 | Done (orchestrator: verify 690, e2e 75) | 1 | 0b3f9f8 |
| T2.4 | UX review of gallery and pages | ux-reviewer | E | Done (2 Major: doubled freshness, a11y coverage in T2.5b; 7 Minor to T2.6) | 1 | see docs/reviews/2026-10-02-p2-T2.4-ux.md |
| T2.5b | E2E, axe, Lighthouse, data function perf | qa-engineer | E | Done (attempt 2 fixed a click-then-goto flake; orchestrator: verify 690, integration 23, e2e 273 green; agent: a11y 102, Lighthouse Home and League 0.96/1.00/0.96, script 168,382 B, read p95 under 0.3 ms) | 2 | 976a355 |
| T2.6a | Fix round part 1: one freshness pattern with Sync now, placeholders' next action, More sheet current item, dark pill contrast, week double-click (T2.4 M1, m6, m7, n1; T2.5b bug 1) | frontend-engineer | F | Done (orchestrator: verify 693, e2e 273; agent: a11y 102; `/l/[leagueId]` 162,999 B, settings 168,871 B, gallery 193,280 B; Sync now lazy-loaded) | 1 | 05d379e |
| T2.6b | Fix round part 2: Home issues headline, team detail rows and highlight, League mobile, Settings sync summary, onboarding done view, wide table, soft 404 (T2.4 m1 to m5, n2; T2.5b bug 2) | frontend-engineer | F | Done (orchestrator: verify 693; agent: a11y 102, 8 e2e failures from intended UI changes go to T2.6c; unknown rosterId now 404 via route groups `(main)` and `league/(list)`; settings 168,998 B) | 1 | d5d52f4 |
| T2.6c | E2E updates for intended UI changes plus tests for the Batch F fixes | qa-engineer | F | Done (orchestrator: verify 693, e2e 285 green; agent: a11y 102; found TEAM-3 blank not-found page flake, to T2.6d) | 1 | d8fa529 |
| T2.6d | Batch F review M1 (loading boundaries for Settings and stubs), m1 to m5, n1; T2.6c bug (blank not-found page under load) | frontend-engineer | F | Done except TEAM-3 (verify 710, e2e 285/285 x2; M1, m1-m5, n1 all resolved and orchestrator-verified; TEAM-3 flake root-caused but not fixable in owned paths, see backlog) | 2 (attempt 1 hit a session limit after a test-retry workaround was correctly rejected and reverted) | bdca45e |
| T2.6d-fix | My Team soft-404 (team/page.tsx had the same notFound+loading.tsx conflict as team detail pre-T2.6b) | orchestrator | G | Done (direct fix, precedented one-file deletion; verify 710, e2e 41/42 only known TEAM-3 flake) | 1 | 887dc00 |
| T2.6d-test | MYTEAM-3 e2e coverage for the My Team 404 fix | qa-engineer | G | Done (30/30 at repeat-each=10, orchestrator-verified) | 1 | 7e00c00 |
| G2-M1 | G2 code review M1: block cross-origin and non-JSON writes on mutating API routes | backend-engineer | G2 | Done (verify 721, integration 23; 1-line orchestrator fix to an integration test request header) | 1 | 1aaa95d |
| G2-B1 | Checkpoint bug: worker resolves sleeper_user_id when identity was env-seeded ("doesn't know which team is mine") | sleeper-data-engineer | G2 | Done (verify 728, integration 23; full gate re-run pending, batched with other checkpoint fixes) | 1 | b7aa20a |
| T2.7a | Visual identity part 1 (ADR-011): tokens, Inter, radius, primitives, gallery swatches | frontend-engineer | G2 | Done (verify 728, build OK, all text pairs AA by agent's computed ratios; e2e and screens after T2.7b) | 1 | 7dc84e1 |
| T2.7b | Visual identity part 2: page density and layout, plus ux minors m1, m2, m3, m6 | frontend-engineer | G2 | Done (verify 728, build OK; m3 top bar label left: lives in components/shell; e2e pending port 3000) | 1 | 27ae22d |
| T2.7c | E2E updates for the redesign (rosters list removed, back link, strings, h2) | qa-engineer | G2 | Committed, not yet run (port 3000 in use); orchestrator scoped TEAM-4 locators | 1 | 43ce389 |
| T2.7d | TEAM-3 serial (ADR-012), DEVTOOLS-1, first e2e and axe run of the redesign | qa-engineer | G2 | Done (e2e 294/294 x5 by agent, x1 by orchestrator; a11y 290, 0 violations on the new palette; DEVTOOLS-1 passes) | 1 | 8fd82a3 |
| G2-reviews | Batch F code and UX review (closeout) | code-reviewer, ux-reviewer | G | Done (code: 1 Major found and fixed same session, see T2.6d-fix; UX: APPROVE, no Blocker/Major) | 1 | see docs/reviews/2026-10-02-p2-batchF2-{code,ux}.md |
| G2 | Gate and human checkpoint | qa-engineer, code-reviewer, ux-reviewer, orchestrator | G | Not started | 0 | |

Plan: ADR-009. Approved with answers: Settings v1 in Phase 2; G2 reviewed locally with phone over the LAN; My Team nav entry; screenshots only from a seeded temp DATA_DIR.


## Earlier phases

Phase 0 and 1 task tables and the pre-triage backlog are in `docs/archive/progress-phase0-1.md`. Standing rules for briefs are in `docs/brief-rules.md`.

## Backlog (open items only)

Remove an item when it is done; the archive keeps history.

### Phase 2 (before or at G2)

- G2 checks: Sleeper username charset `[A-Za-z0-9_.]` (1 to 40) against the live run; dev HMR websocket over the LAN; capture not-found, More sheet open and onboarding first-run steps; the no-.env path of `pnpm run sync`.
- Settings route is 168.5 KB of the 170 KB target. After a Settings league switch, /onboarding has no `syncSince` (expose it via onboarding status, backend).
- Client schemas import shared by deep path (`@sideline/shared/src/api/...`); consider a light `@sideline/shared/schemas` entry (backend plus devops).
- Layout DB-error catch and `app/error.tsx` untested at runtime. "Still syncing" has no auto refresh. 429 countdown not exercised live.
- Two `start-standalone.mjs` at once race on copying `.next/static`. No shared Input/Select component.
- Gallery route JS 189,202 B (budget 204,800): keep additions lean. Gallery jump list (UX m7).
- Temp seeded DATA_DIRs (e2e, Lighthouse, screens) are never cleaned up. Overlay fade under reduced motion (axe waits on `settleAnimations`).
- `scripts/lib/seed.ts` may not forward `--no-identity`.
- T2.6a: two-fast-clicks week path has no e2e (unit-tested `stepWeek`); Sync now banner at 390 and More sheet marker not yet seen in screenshots (Batch F UX recheck).
- T2.6b: Home flagged-starters list and the bye badge never seen in a screenshot (fixture week 4 has no flagged starters); unit tests only. Team detail, Settings and stub pages no longer have a loading skeleton. `lib/client/api.ts` imports schemas from `app/onboarding/_components/schemas` (move later). Settings has about 5 KB of route JS headroom.
- Batch F review m6 (docs/reviews/2026-10-02-p2-batchF-code.md): every StaleBanner renders Sync now (test id duplicates if two banners); Suspense fallback may shift layout.
- Batch F closeout UX review (docs/reviews/2026-10-02-p2-batchF2-ux.md) m1: the not-found page's only heading is an `EmptyState` h2, no h1 anywhere on the page; add an optional `level` prop to `EmptyState` (default 2), pass `level={1}` from `app/not-found.tsx`. n1: `sync-now-button.tsx`'s 2s-delayed `router.refresh()` could shift visible content, not confirmed live, watch item. n2: not-found page has zero app chrome beyond "Go home"; consider a minimal back link later.
- **TEAM-3 flaky e2e test (T2.6d finding, question for Steph at G2).** `e2e/pages.spec.ts` TEAM-3 (`/l/{leagueId}/league/teams/9999`, an unknown rosterId) fails intermittently under heavy parallel Playwright load: about 4-5 of 45 repeats, confirmed independently by the orchestrator (1 failure in a single full-suite run). Root cause (evidence-based, not a missing/misplaced `not-found.tsx`): Next.js 16 renders any unguarded `notFound()` (no Suspense boundary above it, which ADR-009 item 18 requires to get a real 404 status) via an internal error-RSC path that streams an empty `<head>` and defers the app's one global stylesheet to client-side hydration via React's stylesheet-precedence commit-blocking mechanism. Under heavy parallel load the deferred CSS `GET` occasionally aborts (`net::ERR_ABORTED`) without firing load/error, so React's own internal 60 s safety timeout (`SUSPENSEY_STYLESHEET_TIMEOUT`) is what eventually unblocks the commit, far past any reasonable test timeout. No fix exists in frontend-engineer's owned paths; the architecture that causes it (no Suspense boundary above `notFound()`) is intentional per ADR-009 item 18 and not something to revert. Candidate owners: backend-engineer (a `middleware.ts` pre-check, though it would need a DB lookup for this specific case since the rosterId is numeric and valid-shaped) or qa-engineer/devops-engineer (reduce Playwright worker/project concurrency for this suite, a test-environment change, not a weakened assertion). Real-world risk is low: this reproduces only under 45 simultaneous first-hits to the same URL across 3 browser projects, far beyond any single self-hosted user's traffic pattern. Decision needed from Steph at G2: fix now, accept as a known/logged flake, or reduce test concurrency.
- T2.5b gaps: NAV-6 mocks the league-switch POST (real switch and "Still syncing" not exercised in e2e); stale and preseason states not in e2e (fixtures are fresh mid-season; unit tests cover them). Empty username submit shows no message (button disabled; accepted).

- **G2 UX review minors (frontend-engineer, `docs/reviews/2026-10-02-G2-ux.md`).** m1 onboarding ready view alignment at 1280; m2 League rosters list duplicates standings on desktop; m3 team detail back link and top bar label; m4 theme toggle labels at 390; m5 sync summary wording and tooltip; m6 one shared content width across pages; n1 reserve a stat slot in roster rows. Also: `pnpm screens` cannot capture 404 routes (devops-engineer).

- **G2 checkpoint notes (Steph).** Settings cannot re-run setup for the same username (Change stays disabled when unchanged); consider a "Re-check my account" action. Next.js dev indicator: offered `devIndicators: false` (devops), awaiting answer. B1 follow-up: an invalid configured username makes one failing lookup per cycle.
- **T2.7b follow-ups (frontend-engineer).** m3 top bar label "League / <team>" in `components/shell/app-shell.tsx`; player-row primitive still caps at `md:max-w-2xl` for other consumers; check the full-width standings table at 1280.
- **T2.7a follow-ups.** `geist` dependency now unused (devops-engineer). `next/font/google` needs network at build time, Docker included (check at the gate).
- **G2 gate leftovers.** Missing `favicon.ico` (console 404; with the PWA work, frontend-engineer). `.playwright-mcp/` not in `.gitignore` (devops-engineer). Gallery states not asserted one by one; NAV-6 mocks the league-switch POST (qa-engineer).

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

### Later phases

- T3.5 and T4.1 own the real `gradeFromScore` and `trendFromDelta` thresholds (placeholders now). No testing-library/jsdom: components have mapping tests only.
- T4.3: supervisor starts the worker, runs migrations, PUID/PGID 99/100; worker container inherits NODE_ENV=production; trim better-sqlite3 prebuilds and sharp; revisit health (stale heartbeat fails the healthcheck).
- T4.x auth refuses to start with an empty SESSION_SECRET or APP_PASSWORD.
- T6.2: remove the next@16.3.8 `minimumReleaseAgeExclude`. T6.3: themeColor vs the in-app theme toggle.
- P1: nflverse play-by-play for red-zone touches (TREND-2).

## Questions for Steph

- **G2 checkpoint (asked 2026-10-02, see `docs/gates/G2.md`):** answered: TEAM-3 option (c) and dev tools local-only (ADR-012); palette and design direction given (ADR-011). Still open: final look-and-feel approval after the redesign screenshots.
