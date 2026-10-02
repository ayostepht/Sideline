# Decisions (ADR-lite)

Format: number, date, decision, context, alternatives considered, consequences. ADR-001 (stack) and ADR-002 (data sources) are reserved for T0.6, per PLAN.md section 9.

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

Still to pin when first installed (owning task records the version here): Tailwind CSS, shadcn/ui, Radix, lucide-react, Recharts, TanStack Table (T2.1).

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
