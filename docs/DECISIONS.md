# Decisions (ADR-lite)

Format: number, date, decision, context, alternatives considered, consequences.

## Rules in force (summary)

Read this list at session start. Open a full ADR below only when a task touches it. Keep this list in sync when an ADR is added or superseded.

- **Process (ADR-000):** delegate only to the 8 project agents plus Explore. The current week always comes from `/v1/state/nfl`. Stub scripts exit non-zero and the gate reports them SKIPPED. Lockfile and generated fixtures don't count toward the 400-line task size.
- **Privacy (ADR-000, ADR-009 item 17):** real identifiers only in `.env`; staged diffs scanned before every commit, the whole repo at gates. Spike data in `.spike-cache/`. Screenshots only from a fixture-seeded temp DATA_DIR; `scripts/screens` refuses anything else.
- **Stack (ADR-001, ADR-007):** exact pins (table in ADR-001). TypeScript 6.0.3 until typescript-eslint supports 7. Webpack builds, not Turbopack (`.js` extension alias). Deployable images are linux/amd64.
- **Sleeper (ADR-002, ADR-005, ADR-009):** the worker is the only Sleeper caller, through one shared limiter; the web enqueues `sync_requests`, including onboarding jobs `user` and `user_leagues`. `/players/nfl` at most once per day. No live calls during development; the orchestrator makes the gate's live run. Projections keep only real rows; the last pre-kickoff snapshot is kept per player-week.
- **Scoring (ADR-002):** `sum(stats[k] * scoring_settings[k])`; SCORE-3 exceptions listed in ADR-002 item 3. Partial weeks stay out of golden tests and SCORE-2.
- **nflverse (ADR-006):** primary kickoff source (America/New_York wall time); fallback lock times per ADR-002 item 6; join by trimmed gsis_id, then name plus team; `LA` maps to `LAR`; no red-zone touches (P1).
- **Waivers (ADR-003):** rolling waivers are P0 (WAIVER-6a to 6d); FAAB recommender is P2.
- **Data layer (ADR-005):** idempotent upserts count real changes only. `/api/health` returns 503 only when SQLite fails. The web never runs migrations. A DB lease prevents overlapping syncs.
- **App (ADR-009):** identity and active league in `app_settings` (env seeds them; then the DB wins). Routes under `/l/[leagueId]`. Server components call `lib/server`; route handlers only for client interactions. Stale means older than 2x `SYNC_CADENCE_MS`. `/dev/gallery` needs `SIDELINE_GALLERY=1`. Route JS target 170 KB.
- **UI checks (ADR-004):** the no-horizontal-scroll check compares `scrollWidth` with `clientWidth`.
- **Ownership (ADR-000, ADR-005, ADR-008, ADR-009):** dependencies, `next.config.ts` and `postcss.config.mjs` belong to devops-engineer; `components/ui/` to frontend-engineer; fixture output under `tests/fixtures/` is written by the sleeper-data-engineer recorder.
- **Visual identity (ADR-011):** palette #FFFFFF, #2A2A2A, #D9D9D9, lime #D5FC51 (fill, never text on light), plus a blue and neon purple #DF00FE (secondary accent, non-text or large text only); Inter; corners at most 4px; denser spacing; scoreboard feel.
- **G2 checkpoint (ADR-012):** notFound() page tests run serial in chained `*-notfound` projects, assertions unchanged, retries 0; dev tools allowed in `next dev`, asserted absent from the production/Docker build (DEVTOOLS-1).
- **Session reading (ADR-010):** HANDOFF, PROGRESS, this list, latest gate report; PLAN by section; briefs point to `docs/brief-rules.md`.
- **Coverage (ADR-005 item 8):** `lib/server`, `app/api`, db and worker at least 75% lines; sleeper and providers at least 85%.
- **Phase 3 plan (ADR-013):** T3.2/T3.3/T3.4/T3.8 split into lettered subtasks; a new worker-written table always gets its `packages/db` upsert helper from backend-engineer first. The optimizer takes player value and matchup multipliers as plain inputs, never importing `projections` or `matchup`; the lineup API (T3.7) wires them together. LINEUP-8 property tests and golden scenarios are qa-engineer's (T3.6), not co-located unit tests.

## ADR-000: Process, privacy, and ownership decisions for Phase 0

Date: 2026-10-01

**Decision**

1. **Instruction precedence.** Steph's kickoff message wins over CLAUDE.md and PLAN.md where they conflict. Conflicts found:
   - Delegation is limited to the 8 project subagents in `.claude/agents/` plus the built-in Explore agent (read-only). No plugin agents, no general-purpose agent, and no built-in Plan agent. CLAUDE.md doesn't forbid others, so this is a narrowing, not a contradiction.
   - The current week always comes from `GET /v1/state/nfl` and is never hardcoded.
   - The dev machine placeholder in the kickoff message was left unfilled. The detected platform is macOS (arm64).
2. **Real identifiers stay out of the repo.** Steph's Sleeper username and league id live only in the gitignored `.env` (`SLEEPER_USERNAME`, `DEFAULT_LEAGUE_ID`). Tracked files say "Steph's league" or use placeholders and never contain the username, league id, league name, user ids, avatars, or manager and team names. Briefs tell subagents to read the values from `.env`. The orchestrator greps every staged diff for live-fetched identifiers before each commit, and greps the whole repo at each gate.
3. **Spike raw data** goes only to the gitignored `.spike-cache/`. Samples in `docs/sleeper-api-notes.md` are sanitized.
4. **T0.2 bootstrap exception:** devops-engineer creates the initial `apps/web` skeleton (package.json, next.config, minimal layout and page, `app/api/health/route.ts`) once. After G0, `apps/web/app/api` belongs to backend-engineer and the rest of `apps/web/app` to frontend-engineer.
5. **Fixture output:** sleeper-data-engineer may write generated files into `tests/fixtures/sleeper/` via `scripts/fixtures/record.ts`. Hand-written test code under `tests/` stays with qa-engineer.
6. **Tracking docs:** the orchestrator writes `docs/PROGRESS.md` and `docs/DECISIONS.md` (removed from T0.1 scope).
7. **Dependency installs:** T0.1 pre-installs all Phase 0 dev dependencies so parallel tasks don't race on `pnpm-lock.yaml`. In a parallel batch, only one designated task may run `pnpm add`.
8. **Fixture layout contract:** `tests/fixtures/sleeper/v1/<url path>.json`, `tests/fixtures/sleeper/projections/<season>/<week>.json`, `tests/fixtures/sleeper/stats/<season>/<week>.json`, plus `tests/fixtures/sleeper/manifest.json` (camelCase keys: `leagueId`, `season`, `weeks`, `partialWeeks`, `recordedAt`).
9. **Partial weeks:** in-progress weeks (week 4 at recording time) are marked partial and excluded from SCORE-2 validation and all golden expectations.
10. **Diff budget:** generated fixtures and the lockfile don't count toward the ~400-line task size.
11. **Stub scripts** for not-yet-implemented root scripts exit non-zero with "not implemented until Tn.x". `pnpm gate` reports them as SKIPPED, never PASS.
12. **Toolchain:** Node 24 LTS (via fnm locally, `.nvmrc` plus `engines`) and pnpm pinned through `packageManager`. Container runtime for local checks: OrbStack. Deployable images target `linux/amd64` (Unraid is x86_64). Local dev images may be arm64.
13. **Removed `.DS_Store` from the index** (it was committed with the agent kit) and gitignored it.

**Context:** kickoff instructions and approval notes from Steph on 2026-10-01; the planning pre-flight found no pnpm or container runtime installed.

**Alternatives considered:** running parallel agents in separate git worktrees (rejected: each needs its own install; disjoint paths in one tree are enough for Phase 0).

**Consequences:** sanitization becomes a standing check on every commit. Ownership exceptions 4 and 5 end at G0.

## ADR-001: Stack and pinned versions

Date: 2026-10-01

**Decision:** the stack from PLAN.md 4.1, pinned to exact versions (`.npmrc` sets `save-exact=true`; the lockfile is committed):

| Area | Choice | Version |
|---|---|---|
| Runtime | Node.js LTS (local via fnm, `.nvmrc`, `engines >=24 <25`) | 24.21.0 |
| Container base | `node:24.21.0-bookworm-slim`, tini from Debian apt, non-root `node` user | 24.21.0 |
| Package manager | pnpm (`packageManager` field) | 12.8.1 |
| Language | TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, moduleResolution `bundler`) | 6.0.3 |
| Web | Next.js App Router, `output: 'standalone'`, Turbopack builder | 16.3.8 |
| UI runtime | React / React DOM | 19.3.0 |
| Lint / format | ESLint (flat, type-aware via typescript-eslint 8.71.0), eslint-config-prettier 10.1.8, Prettier | 10.11.0 / 3.9.9 |
| Unit tests | Vitest with @vitest/coverage-v8, fast-check 4.10.2 | 5.0.3 |
| HTTP mocking | MSW | 3.0.1 |
| E2E / a11y | @playwright/test, @axe-core/playwright 4.13.0 | 1.63.0 |
| Lighthouse | @lhci/cli | 0.15.1 |
| Validation | zod | 4.6.5 |
| Logging | pino 10.3.1, pino-pretty 13.1.3 | |
| Scripts | tsx | 4.23.15 |

Pinned in T2.0 (2026-10-02, apps/web dependencies): tailwindcss and @tailwindcss/postcss 4.3.3; @radix-ui/react-dialog 1.1.23, -popover 1.1.23, -tooltip 1.2.16, -dropdown-menu 2.1.24, -tabs 1.1.21, -toggle-group 1.1.19, -visually-hidden 1.2.11, -slot 1.3.3; class-variance-authority 0.7.1; clsx 2.1.1; tailwind-merge 3.7.0; lucide-react 1.49.0; cmdk 1.1.1; next-themes 0.4.6; geist 1.7.2. shadcn/ui is generated code (no runtime package). Recharts and TanStack Table are deferred to Phase 4 (ADR-009 item 6).

Pinned in T1.0 (2026-10-02): better-sqlite3 13.0.3 (SQLite 3.53.4), drizzle-orm 0.45.3, drizzle-kit 0.31.11, @types/better-sqlite3 9.6.0, croner 10.0.1, csv-parse 7.0.3; zod 4.6.5 and pino 10.3.1 also as runtime dependencies of the packages that use them.

**Context:** Phase 0 scaffold (T0.1, T0.2), current stable releases on 2026-10-01.

**Alternatives considered:** TypeScript 7.0.2 (rejected for now: typescript-eslint 8.71.0 declares a peer range `<6.1.0`, and type-aware linting is required); Node 25 (not LTS); corepack (not shipped with Node 25+, so pnpm is installed explicitly, via Homebrew locally and `npm i -g pnpm@12.8.1` in the Dockerfile).

**Consequences:**
- Revisit TypeScript 7 when typescript-eslint supports it.
- pnpm 12 blocks dependency build scripts unless they are listed under `allowBuilds` in `pnpm-workspace.yaml` (esbuild now, better-sqlite3 in T1.3).
- `minimumReleaseAgeExclude` lists next@16.3.8 and its SWC binaries because that release was newer than pnpm's release-age policy at install time; remove the exclusion in T6.2.
- msw 3 has API changes from v2; @vitest/mocker lists an optional msw ^2 peer that only matters for browser mode (unused).

## ADR-002: Data source decisions from the Phase 0 spike

Date: 2026-10-01

**Decision**

1. **Projections source: Sleeper's undocumented projections endpoint (rotowire).** It works, so the PLAN section 12 fallback (baseline model) is not needed now. The provider must: always send `season_type`; keep only real rows (`stats.gp` present, `opponent` not null); filter positions after fetching (FB, P, CB, DB leak through the filter); validate with zod and treat an empty or placeholder-only response as "projections unavailable" rather than success. The worker stores each projection fetch with `fetched_at` and keeps the last pre-kickoff snapshot per player-week, so Sideline builds its own pre-game history.
2. **Scoring (SCORE-1):** plain `sum(stats[k] * scoring_settings[k])` over keys present in both, with missing keys as 0. The spike matched Sleeper's `players_points` for 457 of 457 player-weeks (weeks 1 to 3). No key-mapping exceptions for actual stats. Precomputed `pts_ppr`/`pts_std` fields use Sleeper defaults and are never used for league scoring.
3. **Projection rescoring (SCORE-3) exceptions,** per `docs/sleeper-api-notes.md` section 6: `fgm_50p` is scored with the `fgm_50_59` value (60+ can't be split); `fgmiss = fga - fgm`; DEF points-allowed uses the projected `pts_allow` mapped to an expected bucket value (analytics-engineer documents the method in T3.1); missing DEF/ST return-TD keys count as 0 with a reason code.
4. **2025 data for backtests and variance priors.** Projections and stats return data for all 18 weeks of 2025. Phase 3 MATCH-3 backtests use 2025 (rescored with this league's `scoring_settings`) plus completed 2026 weeks. PROJ-2 uses 2025 weekly league-scored results as the player-level variance prior (`n` counts 2025 games), shrunk toward the position CV as specified. Caveat recorded in every backtest report: 2025 projections are probably closing (last pre-game) values, which can be slightly more accurate than early-week projections.
5. **Future schedule (LEAGUE-5):** future-week `matchups/{week}` returns real pairings. Read weeks from the current week through `playoff_week_start - 1` only. Weeks at or after `playoff_week_start` are placeholders, not the bracket.
6. **Kickoff and lock times:** Sleeper has none (only a game `date`). nflverse schedules are the primary kickoff source (T1.4). Fallback when nflverse is disabled or fails: a player is treated as locked from 13:00 ET on their game date for Sunday games and 20:00 ET for other days. The reason payload marks this as an approximate lock, and the UI says so.
7. **Waivers (WAIVER-6):** `waiver_type` 0 is rolling (high confidence). 2 is treated as FAAB and 1 as reverse standings (medium-low confidence); unknown codes get standard handling plus a warning. `waiver_day_of_week` uses 0 = Monday, and runs are at about 03:00 ET (medium confidence, one league). `waiver_clear_days` gives the free-agent time for dropped players. `rosters[].settings.waiver_position` gives the order (1 = first). Failed claims are visible in transactions, so WAIVER-6b can combine roster need with competing-claim history. Pending claims by other teams are not visible.
8. **Players DB:** `GET /players/nfl` is about 14.7 MB raw (2.25 MB gzip). Still once per day, parsed and trimmed to the fields in PLAN 4.5.
9. **HTTP politeness:** responses carry ETags and support `If-None-Match` (304). Cloudflare edge caching ranges from 60 s to 3,600 s, so polling faster than the edge cache is pointless. The client should send `If-None-Match` where it keeps the previous body. No rate-limit headers exist, so our limiter is the only guard.

**Context:** T0.3a spike, `docs/sleeper-api-notes.md` (93 calls, `/players/nfl` once).

**Alternatives considered:** a baseline projection model now (not needed while the endpoint works; it stays the documented fallback); nflverse-only scoring (unnecessary, Sleeper stats match exactly).

**Consequences:** T1.2 schemas must tolerate placeholder rows and the position leak. T1.3 schema keeps projection snapshots by fetch time. T1.4 nflverse becomes the kickoff source. T3.1 implements the SCORE-3 exceptions. T3.3/T3.5 consume 2025 data, which the worker or a backfill script must fetch politely (36 extra calls).

## ADR-003: FAAB recommender to P2; rolling-priority waiver advisor becomes P0

Date: 2026-10-01

**Decision:** WAIVER-5 (FAAB bid recommender) moves to the P2 backlog. WAIVER-6 expands into WAIVER-6a to 6d (waiver position, competing-need flags for teams ahead in the order, claim-worth-it advice against a value-of-priority estimate, waivers clear time and free-agency time). Phase 4 T4.4 becomes "Waiver priority advisor". T4.2, T4.6, T4.7, the G4 checks, the golden test list and LEAGUE-6 (FAAB fields only in FAAB leagues) are amended in PLAN.md. P1 notifications switch to self-hosted Web Push for the installed iPhone PWA.

**Context:** Steph's league settings show `waiver_type: 0` and waiver transactions carry no bids (rolling waivers), even though `waiver_budget: 100` is set. Steph confirmed she uses rolling waivers and doesn't expect to use FAAB. She asked for Web Push to the iPhone PWA for notifications.

**Alternatives considered:** keeping FAAB as P0 tested only on synthetic leagues (rejected by Steph: effort with no user value this season).

**Consequences:** Phase 4 ships sooner and with more value for this league. Leagues without FAAB remain a supported edge case. The T0.3a spike must document the waiver fields WAIVER-6 needs (roster `waiver_position`, waiver day and hour settings, `waiver_type` codes, whether failed claims appear in transactions).

## ADR-004: UI5 horizontal-scroll check compares against clientWidth

Date: 2026-10-01

**Decision:** UI5 uses `document.documentElement.scrollWidth <= document.documentElement.clientWidth` instead of `<= window.innerWidth`. PLAN.md 10.2 is amended.

**Context:** qa-engineer (T0.4) measured on the Pixel 7 profile that a 1000px-wide element makes both `scrollWidth` and `innerWidth` 1009 while `clientWidth` stays 412, so the original formula passes a page that scrolls sideways. `e2e/helpers/no-hscroll.ts` uses the stricter form, and `e2e/helpers.spec.ts` covers the regression.

**Alternatives considered:** comparing against the device viewport width from the Playwright project (works, but duplicates config and breaks on zoomed layouts).

**Consequences:** any script that checks UI5 (including the T0.5 gate script) must use `e2e/helpers/no-hscroll.ts` or the same formula.

## ADR-005: Phase 1 plan decisions (data layer and sync)

Date: 2026-10-02

**Decision**

1. **Task splits for the 400-line target.** T1.2, T1.3, T1.4, T1.5 and T1.7 are split into lettered subtasks. T1.0 (dependency preinstall, devops-engineer) and T1.8 (Docker and build with SQLite, devops-engineer) are added. PLAN.md section 9 is amended.
2. **Contract placement.** `packages/shared` holds domain types, our API DTOs (health, sync status, sync run request), sync job names, the `Reason` type and the zod env config schema (PLAN 4.4). `packages/sleeper` holds raw response schemas plus pure mappers from raw responses to shared domain types.
3. **One Sleeper caller, enforced.** The web process never calls Sleeper in Phase 1; `POST /api/sync/run` queues a `sync_requests` row that the worker polls. `pnpm sync --once` checks the worker heartbeat: with a live worker it enqueues requests and waits for them; only with no live worker does it run jobs itself. A sync lease in the DB (holder plus expiry, taken atomically) prevents overlapping runs between CLI runs and the worker. The holder renews the lease on a timer well inside the expiry while jobs run, and stops before the next job if a renewal finds the lease lost, so slow runs (including the 2025 backfill) can't lose it mid-job. Phase 2 onboarding (username lookup from web) gets its own decision in the T2.2 brief.
4. **Data model additions to PLAN 4.5:** `player_week_projection_snapshots` (last fetch before each player's kickoff, ADR-002 item 1), `nfl_state`, `http_cache` for ETags (not used for `/players/nfl`), `sync_requests`, and `app_settings` keys for the worker heartbeat, the sync lease and the last `/players/nfl` fetch (the once-per-day guard survives restarts).
5. **Idempotent upserts count real changes only** (`ON CONFLICT DO UPDATE ... WHERE` a column differs), so a second identical sync reports `rows_changed = 0`.
6. **Health semantics.** `/api/health` returns 200 with `status` `ok` or `degraded`, a DB check, worker heartbeat state (`ok`, `stale`, `never`) and the last sync summary; 503 only when SQLite can't be opened or queried. A missing worker or unmigrated schema is `degraded`. The web process never runs migrations. Revisit in T4.3 once the supervisor exists (a heartbeat stale beyond a threshold should probably fail the Docker healthcheck).
7. **`db:seed:fixtures` moves from T1.3 to T1.5c.** It runs the real worker sync against a fixture-backed fetch, so mapping logic is not duplicated.
8. **Coverage (closes G0 review m4).** Route handlers stay thin and logic lives in `apps/web/lib/server`. `apps/web/app/api/**` and `apps/worker/**` are added to coverage at 75% lines. PLAN 10.5 and `vitest.config.ts` amended.
9. **Ownership extensions.** ADR-000 item 5 extends to `tests/fixtures/nflverse/` (written by the sleeper-data-engineer recorder). `apps/web/next.config.ts` belongs to devops-engineer.
10. **Dependency installs.** Only T1.0 runs `pnpm add` in Phase 1; other agents report missing dependencies.
11. **Live API budget.** No Sleeper calls during development. At G1: `pnpm test:contract` (about 20 calls, `/players/nfl` excluded unless `CONTRACT_PLAYERS=1`) and one orchestrator live `pnpm sync --once` into gitignored `./data` (the day's single `/players/nfl` fetch).
12. **Projection filter sanity.** T1.2b documents the real-row rule separately for stats and projections (checked against fixtures), tests that week 5 projections are non-empty after filtering, and reports dropped-row counts by reason. Bye-week players are handled through the schedule, never silently dropped.
13. **Red-zone touches.** If nflverse needs play-by-play for them, TREND-2 ships without red-zone touches (nullable column) and play-by-play goes to the P1 backlog.
14. **`pnpm run sync`, not `pnpm sync`.** pnpm 12 has a built-in `sync` command that shadows the root script, so the CLI is invoked as `pnpm run sync --once [--job=name]`. Root scripts delegate with `pnpm -C <dir> run` because `--filter` turns the stub exit code 2 into 1. PLAN 10.6 amended.
15. **Package manifests.** Dependency changes in any workspace `package.json` belong to devops-engineer (it owns the lockfile). Package owners may add or change `scripts` entries in their own package's manifest.

**Context:** Phase 1 planning on 2026-10-02, approved by Steph with changes (items 3, 6, 12, 13).

**Alternatives considered:** web calling Sleeper directly with its own limiter (rejected: two limiters can't enforce one budget); a separate seed script mapping fixtures to rows (rejected: duplicates the worker's mapping); 503 on a missing worker heartbeat (deferred to T4.3: no worker runs in the container until then).

**Consequences:** the worker is the single gate to Sleeper. Health stays green in the Phase 1 to 3 container. The idempotency check measures real changes.

## ADR-006: nflverse data decisions from the T1.4a spike

Date: 2026-10-02

**Decision**

1. **Assets:** `https://github.com/nflverse/nflverse-data/releases/download/<tag>/<asset>.csv.gz` for `schedules/games`, `stats_player/stats_player_week_<season>` and `snap_counts/snap_counts_<season>`. The 2.5 MB `players` asset isn't needed by the provider.
2. **Kickoff:** `gameday` plus `gametime` are America/New_York wall time, including international games. Convert with the IANA zone (DST ends 2026-11-01), never a fixed offset. A missing `gametime` uses the ADR-002 fallback with `kickoffApproximate: true`. Games can fall on any weekday (Wednesday, Friday, Saturday seen), so no code may assume Thu/Sun/Mon.
3. **Spread sign:** positive `spread_line` means the home team is favored (moneylines agree in 280 of 285 2025 games and 75 of 77 2026 games). Implied totals: home = total/2 + spread/2, away = total/2 - spread/2. Lines exist for played weeks and roughly the next 1 to 2 weeks; later weeks are blank, and null means no implied total.
4. **Team codes:** the only difference is nflverse `LA` to Sleeper `LAR`.
5. **Player join:** Sleeper `gsis_id` covers only about 26% of relevant players and often has a leading space. Join order: trimmed `gsis_id`, then normalized name plus team (plus position), else null usage. Name plus team matched 242 of 244 fixture players; misses are nicknames, handled by a small alias table. Snap counts join the same way.
6. **Usage:** `target_share`, `air_yards_share` and snap `offense_pct` are provided as 0 to 1 fractions. `carry_share` is computed as player carries divided by the team's total carries in that game. Red-zone touches need play-by-play, so per ADR-005 item 13 TREND-2 ships without them (`rz_touches` null) and play-by-play goes to the P1 backlog.
7. **Byes:** derived from the schedule (team absent in a week).
8. **Freshness:** weekly assets lag about a day; a missing week means "no usage yet", not an error.

**Context:** T1.4a spike, `docs/sleeper-api-notes.md` section 14.

**Alternatives considered:** joining through the nflverse `players` asset (works for snaps via pfr id, but adds 2.5 MB downloads for no gain over name plus team).

**Consequences:** T1.4b implements the join order, the alias table, the LA/LAR map, kickoff conversion and carry share. The Sleeper players table keeps a trimmed `gsis_id`.

## ADR-007: Web build uses webpack instead of Turbopack

Date: 2026-10-02

**Decision:** `next build --webpack` and `next dev --webpack`, with `resolve.extensionAlias` mapping `.js` to `.ts`/`.tsx`/`.js`, `module.parser.javascript.url = false` (so webpack does not try to bundle the migrations folder URL in `packages/db`), and better-sqlite3 as a server external.

**Context:** workspace packages use `.js`-suffixed relative imports (TS `moduleResolution: bundler`, `verbatimModuleSyntax`). Turbopack in Next 16.3.8 has no extension-alias option, so `pnpm build` failed as soon as the web app imported `@sideline/shared` (T1.6). ADR-001 listed Turbopack as the builder.

**Alternatives considered:** dropping `.js` suffixes from every workspace package (works with Turbopack, but is a cross-package convention change touching code owned by four agents); `experimental.extensionAlias` (webpack-only, Turbopack ignored it).

**Consequences:** builds are slower than Turbopack. Revisit when Turbopack gains extension aliasing, or if the packages switch to extensionless imports. The Docker image (T1.8) must ship the better-sqlite3 native module and `packages/db/drizzle`.

## ADR-008: Ownership of apps/web/next.config.ts and package manifests

Date: 2026-10-02

**Decision:** `apps/web/next.config.ts` belongs to devops-engineer (build tooling, ADR-007). Dependency entries in any `package.json` remain devops-engineer only (ADR-005 item 15), including `packages/db`.

**Context:** the Batch D review (m8) flagged devops edits to `next.config.ts` and `packages/db/package.json`. Neither path is in the CLAUDE.md roster for devops.

**Alternatives considered:** giving `next.config.ts` to frontend-engineer. Rejected because the config is about bundling and server externals, not UI.

**Consequences:** frontend briefs that need config changes are split out to devops-engineer.

## ADR-009: Phase 2 plan decisions (app shell and league views)

Date: 2026-10-02

**Decision**

1. **Task splits for the 400-line target.** T2.0 (UI dependency preinstall) and T2.0b (seeded screens and gate harness, devops) are added. T2.1 becomes T2.1a and T2.1b; T2.2 becomes T2.2a (contracts and DB), T2.2b (data functions and API) and T2.2c (worker onboarding jobs); T2.3 becomes T2.3a (shell), T2.3b (onboarding and Settings) and T2.3c (Home, League, team views); T2.5 becomes T2.5a (harness) and T2.5b (suites). PLAN.md section 9 amended.
2. **Onboarding goes through the worker** (keeps ADR-005 item 3). New jobs `user` (username to user id) and `user_leagues` (current-season leagues). `sync_requests` gains `params_json`. The web enqueues and the onboarding page polls a status endpoint. With no live worker heartbeat, onboarding shows a "worker not running" error state.
3. **Identity and active league live in `app_settings`** (`sleeper_username`, `sleeper_user_id`, `active_league_id`, plus the stored league list). `SLEEPER_USERNAME` and `DEFAULT_LEAGUE_ID` seed them when unset; after onboarding the DB wins. Worker league jobs read the active league with env as fallback, and log a skip reason when neither exists. Selecting a league stores it and enqueues `all`.
4. **Routes:** `/` redirects to `/onboarding` or `/l/{activeLeagueId}`; `/l/[leagueId]` (Home), `/team` (My Team), `/league`, `/league/teams/[rosterId]`, `/settings`. Lineup, Matchup, Waivers and Players are placeholder pages naming the phase that delivers them. `?week=` is the deep-linkable week.
5. **Rendering:** pages are server components calling `apps/web/lib/server` directly. Route handlers exist only for client interactions (onboarding, search, league switch, Sync now) and stay thin.
6. **Bundle discipline:** no Recharts or TanStack Table in Phase 2 (hand-rolled SVG Sparkline, semantic HTML tables); per-icon lucide imports; target at most 170 KB gzipped per route under the 200 KB budget.
7. **Fonts and theme:** Geist via the `geist` package (no network at build); light, dark and system themes with no flash; toggle in Settings.
8. **`/dev/gallery`** returns 404 in production unless `SIDELINE_GALLERY=1` (set by screens and gate runs).
9. **Freshness:** data DTOs carry `updatedAt` and `stale` (older than 2x `SYNC_CADENCE_MS`, PLAN 3.4).
10. **Standings:** wins, then points for; ties shown; grouped by division when present. All-play and luck stay in Phase 5.
11. **Global search in Phase 2:** players by name with position, NFL team, injury status and owner. A rostered player opens the owner's team page with the player highlighted; a free agent opens a small sheet. The full player sheet is T4.6.
12. **Live API budget:** no Sleeper calls during development. At G2, one live onboarding run by the orchestrator (about 22 calls; `/players/nfl` only if the daily guard allows).
13. **Ownership:** `apps/web/components/ui/` and `components.json` belong to frontend-engineer; `postcss.config.mjs` to devops-engineer (as ADR-008). Tailwind v4 tokens live in CSS (frontend-engineer).

**Steph's approval answers (binding)**

14. **Settings v1 ships in Phase 2:** league and username change, theme toggle, sync status per job, Sync now. Data source toggles wait for T6.3. PLAN 6.4 amended.
15. **G2 is reviewed locally, phone over the LAN.** The dev server and worker bind so the Mac's LAN IP is reachable; `allowedDevOrigins` (or the Next 16.3 equivalent) admits that IP. T2.0b adds a `dev:lan` script that prints the LAN URL. Run instructions mention the macOS firewall prompt. The orchestrator verifies a non-localhost-origin request before the checkpoint.
16. **My Team** is reachable from Home's roster card and the League page, and has its own entry in the desktop sidebar and the mobile More sheet. PLAN 6.3 amended.
17. **Screenshot privacy.** The text identifier scan can't read images. Every committed or archived screenshot (`docs/gates/**`, `docs/reviews/**`) comes only from a fixture-seeded temp DATA_DIR. `scripts/screens` refuses `./data` and any DATA_DIR without the seeding step's marker, with unit tests. `pnpm screens` prints its DATA_DIR and the gate checks that line for UI4. ux-reviewer captures stay in gitignored `.screens/`. PLAN 10.2 UI4 amended.

**Later additions**

18. **Pages that call `notFound()` get no loading boundary** (2026-10-02, T2.6b, Batch F review M1; amended 2026-10-02, Batch F closeout review). A `loading.tsx` above a page makes Next stream a 200 before `notFound()` runs, so an unknown id returns a soft 404 instead of a real one. Loading boundaries live in route groups (`(main)` for Home, `league/(list)` for League) scoped away from pages that call `notFound()`. Team detail (`league/teams/[rosterId]`) and My Team (`team/`) both call `notFound()` and have no loading boundary at all (My Team's `loading.tsx` was removed in the closeout round; it had the same soft-404 gap team detail did before T2.6b). Other pages (no `notFound()` call) keep their own boundaries.

**Context:** Phase 2 planning on 2026-10-02, approved by Steph with answers 14 to 17.

**Alternatives considered:** the web calling `/user` and `/user/leagues` with its own limiter (rejected: two limiters, against ADR-005 item 3); pulling the T4.3 supervisor forward so G2 runs on Unraid (rejected by Steph in favor of local review); no My Team nav entry (Steph chose to add one).

**Consequences:** the worker must run for onboarding, so Docker onboarding waits for T4.3. E2E needs a fixture-mode worker. Screens and gate runs always use seeded temp data.

## ADR-010: Smaller session-start reading

Date: 2026-10-02

**Decision:** sessions read HANDOFF, PROGRESS, the "Rules in force" summary at the top of this file and the latest gate report; PLAN.md is read by section (whole phase section at a phase start). Finished phases' task tables and done backlog items move to `docs/archive/`. Standing brief rules live in `docs/brief-rules.md`, which every brief points to. The orchestrator suggests `/clear` after each batch's reviews are committed.

**Context:** Steph's token budget is limited. Session start read about 125 KB (about 32k tokens), and mid-session compaction is the most expensive event.

**Alternatives considered:** splitting PLAN.md into per-phase files (rejected: breaks section references used throughout the docs).

**Consequences:** the "Rules in force" list must be updated with every new ADR. Full ADRs, reviews and the archive stay available on demand.

## ADR-011: Visual identity from the G2 checkpoint

Date: 2026-10-02. Status: accepted (Steph's direction at the G2 human checkpoint).

**Decision.**
1. **Palette.** Core colors: `#FFFFFF`, `#2A2A2A`, `#D9D9D9`, accent `#D5FC51` (lime), used in both themes. Light: white ground, `#2A2A2A` text, `#D9D9D9` lines and muted surfaces. Dark: `#2A2A2A` ground, white text, `#D9D9D9` muted text. Extension, at most two: an electric blue and a neon purple, for secondary highlights and data. Shades of the neutrals (tints between the core grays) are allowed where a theme needs a second surface or a muted text that passes AA. Red and amber stay as functional colors for injury, error and warning states only, tuned to sit with the palette.
2. **Lime is a fill, not a text color on light grounds** (about 1.1:1 on white). On lime, text is `#2A2A2A`. On the dark ground, lime may be used as text or line color.
3. **Font:** Inter (via `next/font/google`, self-hosted at build time) replaces Geist Sans. Tabular numerals for stats.
4. **Shape:** far fewer rounded corners. Cards and controls at most 4px; no pill shapes except small status dots and avatars.
5. **Density:** tighter spacing; roughly one Tailwind step less padding and gap across cards, lists and sections.
6. **Character:** less generic. Direction chosen by the orchestrator for Steph's review: a sports data, scoreboard feel (bold numbers, small uppercase tracked labels, thin dividers, lime used sparingly as the one loud color).

**Context.** At the G2 checkpoint Steph found the UI generic, too rounded and too airy. G2 stays open until the refresh passes the UI checks and Steph approves the screenshots.

**Alternatives.** Keep the indigo palette with smaller tweaks (rejected by Steph's direction). Lime as the only accent with no extension (kept open: blue and purple are optional).

**Consequences.** WCAG AA still applies; axe must stay at 0 serious or critical. Position badge colors are redrawn from the new palette. `next/font/google` needs network at build time, including Docker builds (checked at the gate). Screens archived for G2 are retaken after the refresh.

**Amendment (2026-10-02, Steph):** the purple extension is neon `#DF00FE`, used more as a secondary accent. It is about 3.8:1 on both #FFFFFF and #2A2A2A, so it is for non-text accents (bars, borders, icons, indicators, badge fills), and large bold text (at least 18.66px bold or 24px) only; small text on a #DF00FE fill is #000000 (5.6:1). Lime stays the primary accent.


## ADR-012: G2 checkpoint test and tooling decisions

Date: 2026-10-02. Status: accepted (Steph, G2 checkpoint).

**Decision.**
1. **TEAM-3 flake, option (c):** the notFound() page tests live in `e2e/not-found.spec.ts`, run serial in three `*-notfound` Playwright projects chained after the main projects (one at a time), with every assertion unchanged and retries still 0. Caveats: a main-suite failure skips them (Playwright dependencies); stress them with `--workers=1`, since `--repeat-each` at default workers still reproduces the root cause. The root cause (deferred stylesheet under load, PROGRESS backlog) stays logged; a server-side pre-check (option a) remains a backlog item, not scheduled.
2. **Next.js dev tools:** the dev indicator stays on for local `next dev` (useful while testing). It must never appear in the production or Docker build. An e2e test (DEVTOOLS-1) asserts its absence on the standalone server, which is the same build Docker ships.

**Alternatives.** (a) fix now with a middleware or DB pre-check; (b) accept with a deadline; hide dev tools everywhere with `devIndicators: false`. Not chosen.

**Consequences.** Slightly longer e2e wall time for the serial block. A regression that leaked dev tooling into production fails the gate.

## ADR-013: Phase 3 plan decisions (scoring, projections, optimizer)

Date: 2026-10-02

**Decision**

1. **Task splits for the 400-line target and for ownership.** T3.2 becomes T3.2a (backend-engineer: `packages/db` upsert helpers for the already-migrated `league_player_week_points` and `defense_vs_position` tables, following the same per-table upsert pattern as every other derived table) and T3.2b (sleeper-data-engineer: the worker recompute hook that calls T3.1's scoring functions and T3.2a's helpers). `packages/db` is backend-engineer-owned (CLAUDE.md section 2); the worker never writes a new table without a db-package helper first, same precedent as ADR-005 item 2 (contracts before consumers). T3.3 becomes T3.3a (PROJ-1 base rescore plus `NO_PROJECTION`; PROJ-4 rest-of-season sum) and T3.3b (PROJ-2 weekly sd with shrinkage; PROJ-3 floor and ceiling), both analytics-engineer in `packages/core/src/projections/`. T3.4 becomes T3.4a (the Hungarian assignment solver, slot and eligibility resolution: LINEUP-1, LINEUP-2, LINEUP-9) and T3.4b (locks, availability multipliers, modes, swap list and reasons output, issues, the LINEUP-7 perf check: LINEUP-3 to LINEUP-7), both analytics-engineer in `packages/core/src/optimizer/`. T3.8 becomes T3.8a (Lineup page) and T3.8b (Home "This week" lineup issues card, plus the Phase 2 design backlog folded in per HANDOFF: scoreboard hero on Home and My Team, lime accent on one content item per page, Home standings snippet "You" badge, a reserved roster-row stat slot), both frontend-engineer. PLAN.md section 9 amended.
2. **The optimizer takes player value as a plain input, not an import.** `packages/core/src/optimizer` never imports `packages/core/src/projections`; LINEUP-5's mode (Projected, Safe, Upside) is resolved by the caller, which passes a `{ playerId: value }` map. This keeps T3.4 testable against synthetic values independent of T3.3's landing order and matches PLAN's dependency graph, which lists T3.4 under T3.1 only.
3. **Matchup multipliers (MATCH-2) are threaded in by the caller, not imported.** PROJ-4's rest-of-season estimate and the optimizer's values both accept an optional per-week multiplier (default 1.0), since T3.5 (matchup adjustment) lands after T3.3 and T3.4 in the batch order. T3.7 (the lineup API) is where real multipliers, real projections and the optimizer are wired together.
4. **LINEUP-8 property tests belong to qa-engineer (T3.6), not inside T3.4b.** Implementing agents write co-located unit tests for their own code (CLAUDE.md section 2); the property suite (at least 1000 runs) and the 12 golden scenarios are qa-engineer's, run once both optimizer subtasks land.
5. **Batch order:** A: T3.1, T3.2a. B: T3.2b, T3.3a, T3.4a (all depend on T3.1; T3.2b also depends on T3.2a). C: T3.3b, T3.4b (each depends on its own part a). D: T3.5 (depends on T3.2, T3.3), T3.6 (depends on T3.4) in parallel. E: T3.7 (depends on T3.4, T3.5). F: T3.8a, T3.8b (both depend on T3.7) in parallel. G: T3.9 (depends on T3.8a, T3.8b).

**Context:** Phase 3 planning on 2026-10-02. `packages/core` was still the T0.1 skeleton; `league_player_week_points` and `defense_vs_position` already exist in the schema from Phase 1 (ADR-005 item 4) with a recompute-hook registry already built in T1.5c, so T3.2 only needed the scoring call and the upsert helpers, not new migrations.

**Alternatives considered:** letting sleeper-data-engineer write the two new upserts directly in `apps/worker` with raw drizzle calls against the schema objects (rejected: every other worker-written table goes through a `packages/db` upsert function; raw-SQL writes in the worker are tracked as backlog debt, not the pattern to extend); one combined T3.4 optimizer task (rejected: LINEUP-1 to LINEUP-9 plus the Hungarian solver clears the 400-line target).

**Consequences:** two more lettered subtasks than PLAN's table shows (T3.2a/b, T3.3a/b, T3.4a/b, T3.8a/b) but the dependency shape and phase-gate checks (PLAN 9) are unchanged.
