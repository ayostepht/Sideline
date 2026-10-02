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

## Phase 0 tasks

| ID | Title | Agent | Batch | Status | Attempts | Commit |
|---|---|---|---|---|---|---|
| T0.0 | Toolchain, branch, tracking docs, ADR-000/003, PLAN amendments | orchestrator | 0 | Done | 1 | f7345f1 |
| T0.1 | Workspace scaffold and tooling | devops-engineer | A | Done | 1 | a6e3f2c |
| T0.2 | Next.js skeleton, /api/health, Dockerfile | devops-engineer | B | Done (review fixes) | 2 | a21579d, 36934fd |
| T0.3a | Sleeper API spike and api-notes | sleeper-data-engineer | B | Done | 1 | 6c89e16 |
| T0.4 | Test harness (MSW, Playwright, axe, LHCI) | qa-engineer | B | Done (review fixes) | 2 | b5e50ad, 3308ac3 |
| T0.3b | Fixture recorder and sanitized fixtures | sleeper-data-engineer | C | Done | 2 (attempt 1 leaked real ids into test-data.ts, caught by orchestrator scan before commit) | d47388e, 7c0ff9f |
| T0.5 | gate and screens scripts, CI | devops-engineer | C | Done (2.1k lines, over the 400-line guideline; accepted, mostly helpers and tests) | 1 | 7326537 |
| T0.6 | ADR-001, ADR-002, PLAN amendments | orchestrator | D | Done | 1 | 0292fe2 |
| T0.5-fix | Batch C review fixes (M1, m1-m5, m7, m11, n1, n3) | devops-engineer | C-fix | Done (restarted once after a usage-limit interruption) | 1 | 4471a14 |
| T0.3b-fix | Batch C review fixes (m8-m10, m12) | sleeper-data-engineer | C-fix | Done (restarted once after the same interruption) | 1 | 5f4a760 |
| G0 | Gate | qa-engineer, code-reviewer, orchestrator | E | PASS | 1 | see `docs/gates/G0.md`, tag `gate-G0` |

## Phase 1 tasks

| ID | Title | Agent | Batch | Status | Attempts | Commit |
|---|---|---|---|---|---|---|
| T1.B0 | Branch, ADR-005, PLAN amendments, coverage config | orchestrator | 0 | Done | 1 | e4330e4 |
| T1.0 | Dependency preinstall, workspace links, script wiring, next.config | devops-engineer | A0 | Done | 1 | b0cf521 |
| T1.1 | Shared domain types, DTOs, env config | backend-engineer | A | Done | 1 | 4aa4207 |
| T1.2a | Sleeper HTTP core (limiter, retries, errors, ETag) | sleeper-data-engineer | A | Done | 1 | aab3c0c |
| T1.1-fix | Review fixes m6-m9 (cron, TZ, transaction fields, timestamp note) | backend-engineer | A-fix | Done | 1 | 133ebef |
| T1.2a-fix | Review fixes m1-m3, m5, n1 (Retry-After cap, body cancel, monotonic limiter, timer injection) | sleeper-data-engineer | A-fix | Done | 1 | fa96fab |
| T1.4a | nflverse spike and fixture recorder | sleeper-data-engineer | A | Done | 1 | d5b2200 |
| T1.2b | Sleeper endpoints, schemas, real-row filters, mappers | sleeper-data-engineer | B | Done (agent hit the session limit after finishing; orchestrator verified; 712 non-test lines, mostly schemas, accepted) | 1 | 38ee8a4 |
| T1.3a | DB schema, migrations, sync/heartbeat/request/lease helpers | backend-engineer | B | Done | 1 | 195826e |
| T1.4b | nflverse provider | sleeper-data-engineer | B | Done (attempt 1 stopped at pause before writing; attempt 2 delivered; 693 non-test lines across 7 files, accepted) | 2 | f759d28 |
| T1.3a-fix | Batch B review M1-M3, m1, n1 (waiver_position, total_rosters, reapStale, unique lease holders) | backend-engineer | B-fix | Done | 1 | d155036 |
| T1.3b | DB upserts, snapshots, ETag store, computed_cache | backend-engineer | C | Done (targeted checks; full verify pending T1.5a) | 1 | fd8023f |
| T1.5a | Worker framework, CLI, lease, game windows | sleeper-data-engineer | C | Done (targeted checks; worker coverage 83.8%) | 1 | 45c4b9e |
| T1.6 | Health, sync status, sync run API | backend-engineer | C | Done (build fix T1.6-build by devops-engineer in 34e0e78) | 1 | 7995e8e |
| T1.6-fix | Batch C review M3, m1: shared SYNC_CADENCE_MS (projections 60 min), findActiveRequest, enqueue with created flag, web uses them | backend-engineer | C-fix | Done | 1 | be35d5f |
| T1.5a-fix | Batch C review M1, M3 (worker side), m2-m4: CLI heartbeat re-check, shared cadences, reap only pre-acquire rows, seed lastAttempt from any run, shutdown timeout | sleeper-data-engineer | C-fix | Done (orchestrator lint/format fix; worker coverage 83% lines) | 1 | 4b021b2 |
| T1.5b | Sleeper sync jobs and 2025 backfill | sleeper-data-engineer | D | Done (479 tests; worker+sleeper lines 92%) | 1 | eeaf97d |
| T1.7a | Integration and contract harness | qa-engineer | D | Done (fixtures README left open; root scripts wired in 3091394) | 1 | fe43bdd |
| T1.8 | Docker and build with SQLite | devops-engineer | D | Done (container health 200 degraded in 2 s, verified by orchestrator) | 1 | 847c7e0 |
| T1.5c | nflverse job, derived hook, db:seed:fixtures | sleeper-data-engineer | E | Done | 1 | 8433f87 |
| T1.7b | Integration suites | qa-engineer | F | Done | 1 | 08c4d7a |
| T1.7a-fix | Contract suite without skipIf (gate U4) | qa-engineer | G1 | Done | 1 | 9233328 |
| T1.8-fix | Gate standalone server temp DATA_DIR and failure logs (UI1/UI2); e2e health expects degraded | devops-engineer, orchestrator | G1 | Done | 1 | 49956b7, 0d0c0c3 |
| G1 | Gate | qa-engineer, code-reviewer, orchestrator | G | PASS | 1 | see `docs/gates/G1.md`, tag `gate-G1` |

Plan: ADR-005. Approved changes: single caller enforced (CLI enqueues to a live worker; renewed DB lease), projection real-row rule documented per endpoint with a week 5 non-empty test and bye handling via schedule, red-zone touches dropped to P1 if they need play-by-play.

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
| T2.2f | Fixture seed stores the fixture user identity, league choices, active league (`--no-identity` keeps anonymous) | sleeper-data-engineer | E0 | In progress | 1 | |
| T2.4 | UX review of gallery and pages | ux-reviewer | E | Not started | 0 | |
| T2.5b | E2E, axe, Lighthouse, data function perf | qa-engineer | E | Not started | 0 | |
| T2.6 | Fix round | frontend-engineer | F | Not started | 0 | |
| G2 | Gate and human checkpoint | qa-engineer, code-reviewer, ux-reviewer, orchestrator | G | Not started | 0 | |

Plan: ADR-009. Approved with answers: Settings v1 in Phase 2; G2 reviewed locally with phone over the LAN; My Team nav entry; screenshots only from a seeded temp DATA_DIR.

## Standing rules for briefs

- Real identifiers (username, league id, league name, user ids, manager and team names) are read from `.env` and never written to tracked files (ADR-000).
- Partial weeks (in progress at recording time) are excluded from SCORE-2 validation and golden expectations (ADR-000 item 9). Phase 3 briefs must restate this.
- Agents use Node 24: prefix shell commands with `export PATH="$HOME/.local/share/fnm/node-versions/v24.21.0/installation/bin:$PATH"` (the tool shell defaults to Node 25).

## Backlog (Minor findings and follow-ups)

- T1.0 (was T1.3): add `better-sqlite3: true` under `allowBuilds` in pnpm-workspace.yaml (pnpm 12 blocks native builds by default).
- T4.3: revisit health semantics once the supervisor exists; a worker heartbeat stale beyond a threshold should probably fail the Docker healthcheck (ADR-005 item 6).
- ADR-001: TypeScript pinned to 6.0.3 (not 7.x) because typescript-eslint 8.71 requires `<6.1`. Revisit when typescript-eslint supports TS 7.
- Image size: the gate measures `docker image inspect` Size (93.3 MB arm64, 93.2 MB amd64 for web alone; HOST-5 limit 400 MB). OrbStack's "disk usage" column (about 400 MB) is not the measure.
- Route JS headroom: the placeholder page already ships about 132 KB of 200 KB gzipped script. Frontend briefs (T2.1+) must lazy-load charts and watch bundle size.
- Lighthouse best-practices is 0.96 against a 0.95 floor on the placeholder page.
- Review m4: resolved in ADR-005 item 8 (api and worker at 75% lines).
- Playwright `--project` is variadic: put the spec path before `--project`.
- tests/fixtures/README.md should list the extra manifest keys the recorder writes (currentWeek, futureMatchupWeeks, projectionWeeks, statsWeeks, syntheticLeagueId, sanitizerVersion, trimming). Owner: qa-engineer.
- `pnpm fixtures:check` needs the gitignored raw cache or live API, so it cannot run in CI. The orchestrator runs it plus an independent live-fetched identifier scan before every commit and at every gate.
- Fixtures are 5.6 MB (target under 6 MB): little headroom for re-recording more weeks; re-record with trimming rather than growing.
- G0 review N1: `pnpm gate --only=...` overwrites `docs/gates/latest.json`; write partial runs to `latest.partial.json`. Owner: devops-engineer.
- G0 review N3: `reuseExistingServer: !CI` in playwright.config.ts can reuse a stale local server. Owner: qa-engineer.
- G0 review N4: UI3 should wait for port 3000 to be released after stopping the shared server. Owner: devops-engineer.
- G0 review n1 and Batch C n2: document the Lighthouse script-size unit; update tests/fixtures/README.md fake id ranges, manifest keys and the short-name word-boundary rule. Owner: qa-engineer.
- T1.0: pnpm prints a peer-dependency warning on install (not investigated). @types/better-sqlite3 9.6.0 may lag the v13 API. Worker stub scripts use root tsx; add tsx to the worker when real scripts land. Owner: devops-engineer (T1.8).
- Per-project coverage (`vitest run --coverage --project X`) prints Unknown% because coverage globs are repo-relative; use the whole-repo run. Owner: qa-engineer (T1.7a).
- T1.2b/T1.5b: pass a `Sideline/<version> (self-hosted)` user agent; `/players/nfl` calls pass `{ etag: false }`; the worker shares one `RateLimiter`.
- P1: nflverse play-by-play for red-zone touches (TREND-2), ADR-006 item 6.
- T1.8 (devops): declare zod and tsx in packages/db (imported/used but resolved via root hoisting); bundle `packages/db/drizzle/` migrations into the image or set `SIDELINE_MIGRATIONS_DIR`. `cli/migrate.ts` has no unit test (covered by the CLI run; db total 91.6%).
- T1.4a review m6/m8 (sleeper-data-engineer): nflverse recorder `--refresh`, size check, fetch timeout, zod for release JSON, root from import.meta.url, write-then-swap; label 14f join rates as spike measurements or add `--report`.
- T1.5c: compute the ADR-002 fallback kickoff when nflverse gametime is missing (provider returns kickoffUtc null, kickoffApproximate true); pass PlayerRef.gsisId as stored. getUsage re-parses cached files each call (fine at this size).
- Batch B review (docs/reviews/2026-10-02-p1-batchB-code.md): m2, m3, m7 providers cache meta zod, guarded/atomic cache writes, season_type filter (sleeper-data-engineer); m4 log loud position-drop counts (T1.5b); m5 stats rows without gp are did-not-play (T3.1); m6 document starters "0" = empty slot in shared (T1.3b).
- Batch D review (docs/reviews/2026-10-02-p1-batchD-code.md): m5 move worker raw SQL reads (`db-reads.ts`) into `@sideline/db` typed helpers (backend-engineer, then sleeper-data-engineer); m7 contract suite header comment on direct fetch and the CONTRACT_PLAYERS gate (qa-engineer); auth task must refuse to start with empty SESSION_SECRET or APP_PASSWORD (T4.x).
- T1.5c follow-ups: degraded nflverse is stored as `skipped` (no `degraded` SyncRunStatus, no note column in sync_runs); consider adding both in shared/db (backend-engineer). With nflverse off there is no schedule list, so no fallback rows are created; `fallbackKickoffUtc` is ready for a Sleeper-date source. apps/worker has no `test` script (devops). Root `db:seed:fixtures` needs an absolute DATA_DIR (default /data). `league_player_week_points` and `defense_vs_position` are not mapped in `JOB_TABLES` yet (T3.2).
- Batch E review (docs/reviews/2026-10-02-p1-batchE-code.md), sleeper-data-engineer: m1 `storeState` in one transaction; m2 recompute changed-tables should include failed jobs with rowsChanged > 0; m3 zod for the fixture manifest; m4 test that a later real gametime replaces an approximate kickoff.
- T1.7b follow-ups: backoff/timeout integration tests hook the client retry warn log in `makeClient` (apps/worker/src/jobs/common.ts); an injectable `sleep` on job deps would make them sturdier (sleeper-data-engineer). RATE-1 sees about 107 calls per game-window hour; the 300/min cap itself is covered by limiter unit tests.
- Batch F review (docs/reviews/2026-10-02-p1-batchF-code.md), qa-engineer: m1 iteration guard in `drive()` (sync-harness.ts) so a changed retry log shape fails instead of hanging; m2 comment that RATE-1 checks schedule cadence and limiter enforcement lives in limiter unit tests.
- G1: worker CLI does not load `.env`; without DEFAULT_LEAGUE_ID the league jobs skip with no log reason. Log the reason (sleeper-data-engineer); decide whether local `pnpm run sync` loads `.env` (devops-engineer).
- G1: gate JSON includes a local Chrome path with the OS user name; write home-relative paths (devops-engineer).
- G1: CONTRACT_PLAYERS=1 widens the contract include to all of tests/contract; CONTRACT-3 body has not yet run live.
- T1.5a-fix: worker function coverage 67% (lines 83%); `seedLastAttempts` uses raw SQL in the worker instead of a `@sideline/db` helper. Fold into T1.5b or T1.7b.
- T1.7a: tests/fixtures/README.md section (what each fixture is, sanitization, fake id ranges, how to re-record) still open; Lighthouse `DATA_DIR=$(mktemp -d)` startServerCommand unverified (run `pnpm lhci` once at G1); e2e/Lighthouse temp DATA_DIRs never cleaned up. The contract suite was run live once by the agent (5 GETs, all shapes passed, nothing written); /players/nfl not yet run.
- T1.5b: move `apps/worker/src/jobs/db-reads.ts` raw SQL into packages/db helpers (backend-engineer); pregame snapshots need nflverse kickoffs, so T1.5c should order nflverse before projections in `ALL_ORDER`; `SIDELINE_VERSION` constant must track package version; consider `etag: false` for regular stats/projections to keep multi-MB bodies out of http_cache.
- T1.8 follow-ups for T4.3: supervisor entrypoint must start the worker (runtime image has web standalone only), run migrations, PUID/PGID for Unraid 99/100; trim all-platform better-sqlite3 prebuilds and sharp. Image content 105 MB, filesystem 320 MB.
- msw is 3.0.1; @vitest/mocker lists an optional msw ^2 peer (browser mode only, unused). Briefs using MSW must point agents at msw 3 APIs.

- T2.2a: Sleeper username charset `[A-Za-z0-9_.]` (1 to 40) is an assumption; check against the live onboarding run at G2. drizzle-kit meta JSON needs prettier after each generated migration (backend-engineer).

- T2.1a: no testing-library/jsdom, so components have mapping tests only (rendering covered by e2e). `gradeFromScore` (80/60/40/20) and `trendFromDelta` (0.5) thresholds are placeholders; T3.5 (MATCH-4 quintiles) and T4.1 (TREND-4) own the real ones. Gallery lacks open sheet/dialog states (add in T2.1b). No `@/` alias (relative imports).
- T2.0b: UI4 gate check fails until Phase 2 routes exist. Dev HMR websocket over the LAN not proven (check at the G2 LAN verification). The no-.env path of `pnpm run sync` untested.
- T2.5a must: seed the Playwright fallback DATA_DIR with `createSeededDataDir` (scripts/lib/seed.ts) and add `SIDELINE_GALLERY: "1"` to webServer.env; change lighthouserc `startServerCommand` to `DATA_DIR=${E2E_DATA_DIR:?...} SIDELINE_GALLERY=1 ...` and URLs to `/l/1000000000000000001` (and League).
- `apps/web/AGENTS.md` and `CLAUDE.md` are generated by `next dev` and committed (775680b) so the tree stays clean.

- Batch A review (docs/reviews/2026-10-02-p2-batchA-code.md): m2, m3, m12 go to T2.5a (validate E2E_DATA_DIR, seeded lhci, SIDELINE_GALLERY in webServer env); m7 to T2.2c (fail unknown jobs; the worker reads `paramsError`); m11 themeColor vs the in-app toggle to T6.3.

- T2.1b: real overlays render only at `/dev/gallery?open=sheet|dialog|why`; add those URLs to screens routes (if query strings are supported) and to the axe route list in T2.5a.

- T2.2c follow-ups: packages/db `claimNext`/`toRequest` throw on unknown job names, so the worker marks them failed with a raw UPDATE (backend: make claim tolerant, then remove the raw SQL); `latestRunPerJob`/`startRun` are SyncJobName-only, so onboarding has no sync_runs rows (accepted for now); `RawLeagueSchema` has no `avatar` (LeagueChoice.avatar always null); 503 retry test takes about 4 s (no injectable sleep in `makeClient`).
- T2.5a e2e fixture worker: `pnpm --filter @sideline/worker start:fixtures` with DATA_DIR set, NODE_ENV not production, DEFAULT_LEAGUE_ID unset. Fixture user `manager_04` (id 100000000000000004), league 1000000000000000001 (season 2026); a second synthetic league 1000000000000000999 also listed.

- T2.2b follow-ups: `rosters` has no division column, so standings `division` is always null (needs db migration plus worker mapping); PATCH settings schema is local to apps/web, not shared; apps/web reads use raw `h.sqlite.prepare` (drizzle-orm not a web dependency); `selectLeague` may report `rate_limited` and skip queueing `all` after a recent sync (sent to the Batch B review); perf measured on a synthetic DB only (T2.5b measures on the fixture DB).

- Batch B review (docs/reviews/2026-10-02-p2-batchB-code.md): m4 raw SQL in apps/web and the worker `failUnknownJobs` into @sideline/db helpers (backend, then sleeper-data); m6 non-ASCII search matching (normalized search_name); m7 WhySheet key to T2.3a; m8 worker container must inherit NODE_ENV=production (T4.3).

- Batch B UX review (docs/reviews/2026-10-02-p2-batchB-ux.md): m7 gallery jump list (backlog). Devops: `pnpm screens` drops the query string from the output folder, so `?open=` captures overwrite each other; include the query in the slug.

- T2.2b-fix: `requestSyncForLeagueChange` uses raw SQL because db `enqueue` dedupes against running rows; add a `@sideline/db` `enqueueFresh` helper with m4. Unknown-user mapping matches the worker text "No Sleeper user with that username" (keep them in sync, or share a constant).

- T2.1c: not visually verified yet: Sheet handle and safe-area padding, ThemeToggle selected ring, PlayerRow chevron (gallery rows aren't interactive; add one). Recheck in the shell UX review. Dark border on background is 2.06:1 (decorative card edges; input borders are a separate token). Briefs: the `pgrep -f "next build"` wait loop matches its own shell; use `pgrep -x node` plus an args check instead.


- T2.3a: `scripts/gate/routes-size.ts` fails on dynamic routes (manifests use `%5BleagueId%5D`, disk has `[leagueId]`); devops fix needed before any gate run. Multi-league switch path untested (fixtures have one league for the user's season in the seed); T2.5b covers it. Concurrent `next build` runs by parallel agents clobber `.next`; sequence builds in future batches.

- Gallery route JS is 189,202 B (budget 204,800). Any new gallery content must stay lean, or split the gallery into sections.

- T2.5a: onboarding e2e server on port 3101 (3001 is taken locally); onboarding state is shared across projects (serial spec). axe runs after `settleAnimations` on overlays (mid-fade contrast); consider skipping overlay fade under reduced motion. Temp seeded dirs are never cleaned up (teardown follow-up). Helpers for T2.5b: `e2e/helpers/servers.ts` (seededBaseUrl, onboardingBaseUrl, FIXTURE), `e2e/routes.ts` (existingRoutes, phase2PageRoutes, overlayRoutes), `useTheme`/`expectThemeApplied`.

- T2.3a-fix: the layout's DB-error catch and `app/error.tsx` are untested at runtime (no way to force a read error in the scratch check); add an e2e or unit test in T2.5b if feasible. "Still syncing" has no auto refresh. Test ids changed: `league-switcher-desktop|mobile`, `league-name-desktop|mobile`, `search-trigger-desktop|mobile`, `league-syncing`.

- Shell UX review (docs/reviews/2026-10-02-p2-batchC-ux.md): M3 (single-league mobile name has no settings route from the top bar) accepted as Minor, Settings is in More; m5 onboarding wordmark goes to T2.3b; add `/l/<id>` shell routes to axe and capture Syncing, not-found, More sheet and search states in T2.5b/T2.4.

- T2.3c: Home team card, "You" row, Bye badge and highlight were never seen with a stored user (seeded DB has none); T2.5b should exercise them on the onboarding server after onboarding. Stale freshness text and StaleBanner show together (redundant; T2.4 to judge). Home issue count = starters Out, IR, PUP or on bye in the selected week. test ids listed in the T2.3c report: standings-*, home-*, team-*, no-team-*, league-rosters.

- T2.3b: standalone/`next start` server reports `db.migrated: false` on a seeded DB unless `SIDELINE_MIGRATIONS_DIR` is set (bundled import.meta.url path); APIs behind withMigratedDb then answer 503. Docker sets the env var. Investigate in Batch E (backend, devops). Two `start-standalone.mjs` at once race on copying .next/static. No shared Input/Select component (native controls styled in route folders). 429 countdown wired but not exercised live.

- T2.2d: every `db:generate` must update packages/db/src/migrations-manifest.ts (a journal-sync test fails otherwise); restate in backend briefs.

- T2.3b-fix: client schemas import shared by deep path (`@sideline/shared/src/api/...`) and load lazily to stay under budget; consider a lightweight `@sideline/shared/schemas` entry (backend plus devops). Settings route is 168.5 KB of the 170 KB target. After a Settings league switch, /onboarding has no `syncSince` and uses "any successful run counts" (the layout's Still syncing state covers Home); expose syncSince via onboarding status (backend) later.

## Questions for Steph

- None open. PLAN.md section 13 answered on 2026-10-01.
