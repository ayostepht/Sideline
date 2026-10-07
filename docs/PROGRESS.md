# Progress

## Phase status

| Phase | Gate | Branch | Status |
|---|---|---|---|
| 0 Bootstrap and API spike | G0 | `phase/0-bootstrap` (merged) | Done, G0 PASS 2026-10-01 |
| 1 Data layer and sync | G1 | `phase/1-data` (merged) | Done, G1 PASS 2026-10-02 |
| 2 App shell and league views | G2 (human) | `phase/2-shell` (merged) | Done, G2 PASS 2026-10-02 (Steph approved) |
| 3 Scoring, projections, optimizer | G3 (human) | `phase/3-scoring` (merged) | Done, G3 PASS 2026-10-03 (Steph approved) |
| 4 Waivers, players, Docker beta | G4 (human, optional) | `phase/4-waivers` (merged) | Done, G4 PASS 2026-10-03 (Steph approved) |
| 5 Matchups and league intelligence | G5 | `phase/5-matchups` (merged) | Done, G5 PASS 2026-10-03 (no human checkpoint required) |
| 6 Hardening and v1.0 | G6 (human) | `phase/6-hardening` (merged) | Done, G6 PASS 2026-10-04 (Steph approved). **v1.0.0 released.** |
| 7a Player card (ADR-020) | reviews plus full e2e | `phase/7-player-card` (merged) | Done 2026-10-06, released v1.1.0 |
| 7b Selective: Auto lineup, trades, weather (ADR-022) | mini-gate per feature | `phase/7b-selective` | Planned 2026-10-07, not started |

## Phase 7b task table (ADR-022)

Batches run in order; tasks inside a batch are file-disjoint. Contracts (P7b.1) land first.

| ID | Title | Agent | Batch | Depends on | Reqs | Status | Attempts | Commit |
|---|---|---|---|---|---|---|---|---|
| P7b.1 | Shared contracts: `LineupModeChoice` (adds `auto`), `resolvedMode`/`modeReason` plus server shim; trade evaluate/finder DTOs; weather DTO and `weatherFlags` | backend-engineer | 1 | none | AUTO-1, TRADE-1..5, WX-3, WX-4 | Done | 1 | 7f5ac4c |
| P7b.2 | DB: migration 0005 `game_weather` table and `schedule.stadium_id`, upsert and read helpers; `weather` sync job name and 3 h cadence in `shared/sync.ts` (orchestrator adds the worker `JOB_TABLES` entry as an integration fix) | backend-engineer | 2 | P7b.1 | WX-3 | Done (job name deferred to P7b.6) | 1 | 6be1eda |
| P7b.3 | Core `trade/`: evaluate (multi-player swap, drop rule, ROS lineup delta), fairness label, finder enumeration and prefilter, perf tests | analytics-engineer | 2 | P7b.1 | TRADE-1..4 | Done | 1 | a3ea5e5 |
| P7b.4 | Providers: Open-Meteo client (zod), static stadium table, flag thresholds, recorded fixture | sleeper-data-engineer | 2 | P7b.1 | WX-1, WX-2, WX-4 | Done | 1 | cffc00f |
| P7b.5 | Server: Auto mode in `getLineup` (reads `getMatchup`), default mode, Home card follows | backend-engineer | 3 | P7b.1 | AUTO-1 | Done | 1 | 24a8b72 |
| P7b.6 | Worker: `weather` job (outdoor/open games next 7 days, every 3 h, degrades); orchestrator pre-applies the parked job-name patch (`shared/sync.ts` name and cadence, contracts test count, `JOB_TABLES`) | sleeper-data-engineer | 3 | P7b.2, P7b.4 | WX-1, WX-3 | Done | 1 | 3b6118c |
| P7b.7 | Server: trade data functions and API routes (evaluate, finder, same-seed playoff deltas, export ROS values from roster-strength) | backend-engineer | 3 | P7b.3 | TRADE-1..4 | Done | 1 | 830f9d6 |
| P7b.8 | UI: Auto in the mode toggle (fixes review m3: toggle must show Auto selected), Home card requests `auto`, "Auto picked ..." reason | frontend-engineer | 4 | P7b.5 | AUTO-1 | Done | 1 | 0ef710b |
| P7b.7f | Batch 3 review fixes: trade reason labels use names (M1), honest top-10 playoff reason (M2), hashes add leagues/players (m1), cached baseline sim (m2), `lineup-inputs.ts` breaks the import cycle (m3) | backend-engineer | 4 | P7b.7 | TRADE-1..4 | Done | 1 | b67cca6 |
| P7b.6f | Open-Meteo HTTP 400 counts as a failure, not out of range (m4) | sleeper-data-engineer | 4 | P7b.6 | WX-1 | Done | 1 | 58c64ac |
| P7b.9 | Server: weather reads joined into lineup reasons, next-opponents and matchup data; review m1 (`keepIfNull: ["stadium_id"]` in the SCHEDULE upsert spec) | backend-engineer | 4 | P7b.2, P7b.6 | WX-4, WX-5 | Done | 1 | 571ba04 |
| P7b.10 | UI: Trades route and nav item (Analyzer and Finder tabs, mobile More sheet) | frontend-engineer | 4 | P7b.7 | TRADE-3..5 | Done | 1 | 8fc0ddb |
| P7b.3f | Finder: exclude Lopsided, rank by the smaller gain (ADR-022 7a, UX M1); surplus-position give pool (m4); dedupe perf assertion (m5) | analytics-engineer | 4c | P7b.3 | TRADE-2, TRADE-4 | Done | 1 | 2f594b5 |
| P7b.7g | Trades cold-load: measure and fix the server path; batched roster read (UX M3, code m4) | backend-engineer | 4c | P7b.7f | TRADE-4 | Done | 1 | 5e8d30b |
| P7b.10f | Trades and Auto UX fixes: touch popovers, 44px targets, Suspense streaming, before/after grid, selection chips, card actions (UX M1-M3, m1-m4; code m5, n1) | frontend-engineer | 4c | P7b.10 | TRADE-3..5, AUTO-1 | Done | 1 | 552d802 |
| P7b.11 | UI: weather chips on Lineup, player card Next opponents, Matchup | frontend-engineer | 5 | P7b.9 | WX-4, WX-5 | In progress | 0 | |
| P7b.13 | Screens route list adds Trades; `fixtures:check` applies the ADR-018 URL exemption and handles binary false positives | devops-engineer | 5 | none | tooling | Done (routes by devops; checker by sleeper-data as P7b.13b) | 1 | 43e8f14, b0f67ad |
| P7b.3g | Finder variety: at most 2 suggestions per give set and per get set (UX re-check m4) | analytics-engineer | 5 | P7b.3f | TRADE-2 | In progress | 0 | |
| P7b.12 | QA: e2e and a11y for Auto, Trades, weather; fixture DB weather rows | qa-engineer | 5 | P7b.8, P7b.10 (P7b.11 for weather specs) | all | Planned | 0 | |

After each batch: code-reviewer (and ux-reviewer for UI batches 4 and 5). One combined mini-gate for Auto, Trades and weather after batch 5 (changed 2026-10-07 to save tokens; the e2e for all three land in P7b.12). Release v1.3.0.

## Resume point

See `docs/HANDOFF.md` (the single source for resuming after a session limit or `/clear`).

## Earlier phases

Phase 0 and 1 task tables and the pre-triage backlog are in `docs/archive/progress-phase0-1.md`; Phase 2 in `docs/archive/progress-phase2.md`; Phase 3 (task table, G3 phase checks, full backlog-as-of-gate) in `docs/archive/progress-phase3.md`; Phase 4 (task table, live fixes, gate-time fixes, G4 phase checks) in `docs/archive/progress-phase4.md`; Phase 5 (task table, batch review trail, G5 phase checks) in `docs/archive/progress-phase5.md`; Phase 6 (task table, the Batch E post-gate fix round, G6 phase checks) in `docs/archive/progress-phase6.md`; Phase 7a (player card) in `docs/archive/progress-phase7a.md`. Standing rules for briefs are in `docs/brief-rules.md`.

## Backlog (open items only)

Remove an item when it is done; the archive keeps history.

### Found during Phase 7b

- **nflverse sometimes tags London games with the home team's `stadium_id`** (2026 JAX at Tottenham carries `JAX00`), so the weather lookup would use Jacksonville's forecast. Fix candidate: also store and match nflverse `stadium` name (P7b.4 report, `docs/sleeper-api-notes.md`).
- **`readOutdoorGamesBetween` compares ISO strings** (P7b.6 report): a kickoff stored as `...:00Z` (no millis) sorts after the same instant written `...:00.000Z`, so it could drop out at the window's upper edge. nflverse rows are stored with `.000Z`, so the risk is low. Normalize in db (backend-engineer).
- **Route JS after Batch 4c:** Trades 200,441 B, Lineup 197,613 B (was 178,893 at G4; the popover added about 12 KB), Waivers 199,044 B. Lineup and Waivers have about 3% headroom. Candidate: lazy-load `components/info-popover.tsx` (frontend-engineer). All under the 204,800 B hard cap, over the 170 KB soft target. Waivers has about 2.8% headroom.
- **For P7b.12 (qa) and devops:** `e2e/nav.spec.ts` needs Trades in the More sheet list; `scripts/screens/routes.json` lacks `/trades`; the Analyzer's evaluate, live region and prefilled auto-evaluate are untested in a browser (no jsdom in unit tests).
- **Batch 4 review minors m1 to m5, n1** (`docs/reviews/2026-10-07-p7b-batch4-code.md`): require the `weather` fields; `synthesizeUnavailable` placeholder fields; 3-hour hash bucket; Analyzer's per-team `getTeamDetail` calls; Analyzer URL not mirrored after filtering bad ids.
- **Cold Trades Finder is about 0.8 s, and 75% of that is the 10 top-N playoff sims** (P7b.7g). Options if it matters on real data: a batched or shared-draw `simulatePlayoffOddsBatch` in core (analytics-engineer), or prewarming the finder cache after a sync.
- **Trades UX re-check m5** (`docs/reviews/2026-10-07-p7b-batch4-ux-recheck.md`): Analyzer result card headers have different heights at 1280, so the grids misalign (frontend).
- **Batch 1-2 review minors m4, m5** (`docs/reviews/2026-10-07-p7b-batch12-code.md`): the finder's give pool favors my top players over surplus-position players (tuning); the duplicate perf assertion in `finder.perf.test.ts`.
- **`fast-check` is a root devDependency but not a `packages/core` one**; P7b.3 used a seeded loop instead. Add it to core if property tests there are wanted (devops-engineer).

### Found during fix/news-ids (2026-10-07, review `docs/reviews/2026-10-07-news-ids-code.md`)

- [m2] `fillMissingEspnIds` should skip an espn id already used by another player (defense in depth; the provider drops shared ids since NEWS-IDS-4) (backend).
- [m4] `apps/web/lib/server/next-opponents.ts`: a null `kickoff_utc` keeps a played game as "next" until the week rolls over (backend).
- [m5] `next-opponents.ts`: return `reasonUnavailable: "Season complete"` after week 18 (backend).
- [n1] `next-opponents.ts:62` comment wording on bye weeks.

### Found during fix/news-usage (2026-10-07, review `docs/reviews/2026-10-07-news-usage-code.md`)

- [m1] `apps/worker/src/jobs/data-jobs.ts` backfill: if 2025 usage stays empty, every backfill run re-parses cached nflverse CSVs and reports "ok" instead of "skipped". Add a cooldown or terminal state plus a stays-empty test (sleeper-data-engineer).
- [m2] Raw `sqlite.prepare` + `as` casts in the worker (`countRows` in data-jobs.ts, `readPlayerRefs` in nflverse-job.ts); move to `packages/db/src/sync-reads.ts` helpers (backend, then worker).
- [m3] `packages/providers/src/espn-news.ts` `max * 0.6` word-boundary threshold: name the constant.
- [m4] Players guard is 20h, so a manual run 20h+ before the cron allows two `/players/nfl` fetches in 24h. Consider calendar-day plus jitter.
- [n1] `apps/web/lib/server/players.ts:244` maps unknown kinds silently; use `PlayerNewsKindSchema.catch("article")`.
- NEWS-UI-2's measured Show more (effect + ResizeObserver) has no unit test (no jsdom); cover in e2e (qa-engineer).
- The `syncUsageForSeason` diff has no test for the case where usage stays empty on a second run.
- UX re-review [m1]: put the Latest block's "Show more" and "Read full note on ESPN" in one `flex flex-wrap items-center gap-x-4` row (removes ~20px of dead space). [m2]: "Checking for news..." footer text shifts the layout height. Not yet run: `pnpm test:a11y` on `/l/1000000000000000001/players/4046` (port 3000 was held by the dev server) (frontend, qa).

### Found during Phase 7a

- Pre-hydration typing lost (frontend, minor, real users on slow phones): text typed into the Players search before `players-explorer.tsx` hydrates stays in the box but never filters (`queryInput` state initialised from `initialQuery`, DOM value never read back). Fix: on mount, read the input via a ref and call `changeQuery` if it differs. Check `WaiverBoard` and `search-dialog` for the same shape. The e2e side is handled by `e2e/helpers/players-search.ts` (CI flake PLAYERS-FLOW-4/5 on WebKit, runs 37559296289).

- P7.4 left the new `PlayerDetailResponse`/`MatchupSwingPlayer` fields optional (server always sets them) so existing UI test literals compile; tighten to required once P7.6 updates those literals (backend).
- `projectedPts` in weekly rows comes from `league_player_week_points.proj_pts` (stored projection scored by the recompute hook), not strictly the last pre-kickoff snapshot.
- No persisted "fetched, no news" marker: players with zero ESPN news re-queue a refresh on each pop-up open (bounded by dedupe and the 20-pending cap).
- Weekly rows use the player's current team for past opponents/byes; traded players show wrong past opponents (review m3, known limit). Optional test for `state === null` (m4).
- Flaky perf timing: `packages/core` `lineup-impact.perf.test.ts` (1039 ms vs 1000 ms budget) and `recommend.perf.test.ts` failed once each under parallel agent load during Phase 7a, passing on rerun. Same contention pattern as the G4/G5 lesson; watch, do not loosen.
- UX m3: mixed chip weights on the player card; chart label lacks a unit (frontend). UX m5: Waivers is ~14,800 px tall at 390 with no pagination (frontend, pre-existing).
- From P7.7: `pnpm test:a11y`'s `--grep UI2` filter doesn't narrow the run (devops). The e2e seed has no ESPN news or espn ids; `e2e/helpers/news.ts` writes rows directly (a seeded news row would be cleaner, sleeper-data). `tests/property/optimizer.property.test.ts` failed once in `pnpm verify` without a captured seed; if it recurs, keep the printed seed (analytics).
- Fix-round re-review minors (`docs/reviews/2026-10-06-p7-fixround-code.md`): m2 clear focus trigger on non-modal navigation (frontend); m3 short cooldown for failed news fetches (backend); m4 PLAYERCARD-7 uses `window.next.router` (qa); n1 possible duplicate count formatter (frontend).
- P7.6b follow-ups (frontend): sidebar/tab highlight reads "Players" while the pop-up is open (`isNavActive` uses the real pathname; use `titlePathname`); the week selector's `router.replace(pathname)` would navigate to `/players/<id>?week=` if used while the pop-up is open; focus after closing a pop-up opened from search lands on body.
- Fixture-mode ESPN per-player feed always returns athlete 3139477; only a fixture player with that espn id gets per-player news in screens/e2e (P7.7 note).


### Carried from Phase 6

Full detail and fully-fixed history: `docs/archive/progress-phase6.md`.

- **T6.5 security review nits (`docs/reviews/2026-10-04-p6-T6.5-security.md`):** `apps/web/proxy.ts`'s CSP carries `'unsafe-inline'` for `script-src`/`style-src` in all environments (next-themes' pre-paint script, React inline styles, zero third-party/user scripts today) -- accepted residual risk, no mitigation if an XSS primitive is ever introduced; consider a nonce-based CSP if a future dependency ever needs `dangerouslySetInnerHTML`. `favicon.ico` bypasses `proxy.ts` entirely (standard Next.js matcher exclusion) so gets no security headers -- zero practical impact, immutable static content.
- **Batch A code review minor (`docs/reviews/2026-10-04-p6-batchA-code.md`):** `apps/web/lib/server/auth.ts`'s `constantTimeStringEqual` compares a wrong-length guess against a short placeholder instead of a same-length buffer, leaking a small timing signal about the configured password's length. Low real-world risk given the LAN/self-hosted threat model; candidate follow-up if ever revisited.
- **Batch B UX review minor (`docs/reviews/2026-10-04-p6-batchB-ux.md`):** Power Rankings/Playoff-Odds/All-Play's desktop table rows run visibly taller/shorter than neighboring sections due to reason-chip wrapping -- internally consistent and legible, just slightly less uniform in density than Standings. No action required unless density is revisited.
- **Login page UX nit:** card sits slightly above true vertical center at 390px on short viewports. Barely noticeable.
- **T6.3b follow-ups:** no e2e coverage yet for the new `*-offseason` testids or a `complete`-status league at all (the shipped fixture DB is always `in_season`) -- candidate qa-engineer fixture variant. Home's inline "This week's matchup"/"Waiver targets" cards are gated on their own data `.ok` flags, independent of `status` (pre-existing, not changed by this task) -- moot on real pre_draft/complete data since rosters/matchups genuinely wouldn't exist yet, only visible when `status` is toggled without also clearing matchup rows (as in this task's synthetic testing); worth a note for whoever next touches Home's card-level gating.
- **T6.1c follow-up, partially closed by T6.4:** login/logout round-trip e2e coverage now exists (`e2e/auth.spec.ts`, a dedicated third Playwright server with `APP_PASSWORD`/`SESSION_SECRET` set). Still open: `proxy.ts`'s redirect to `/login` carries no `?from=` param, so login always lands on Home rather than back at the originally requested page -- known, minor gap in `proxy.ts` (backend-engineer's file), not blocking.
- **T6.4 follow-up:** `e2e/auth.spec.ts` discovered that `isRateLimited`'s 5/min/IP window falls back to one shared "direct" bucket when no `X-Forwarded-For` header is present, which is every request from a test client with no reverse proxy in front. The spec works around this with a `withUniqueClientIp` helper that fakes a distinct `X-Forwarded-For` per test. Worth remembering as the pattern for any future auth-touching e2e test, not a product bug (the real deployed app always sits behind the documented single reverse proxy).
- **Batch A UX review minors (`docs/reviews/2026-10-04-p6-batchA-ux.md`):** `apps/web/public/icons/icon-512.png`/`icon-192.png`'s purple accent bar's bottom corners sit just outside the standard 80%-diameter maskable safe-zone circle -- a few px of clipping under an aggressive circular OS mask on some Android launchers, barely visible (only the bar's corners, not the chevron glyph). `favicon.ico`'s 16x16 frame is a bit soft (downscaled from 48x48 rather than hand-tuned); still legible.
- **T6.6 final UX review nit (`docs/reviews/2026-10-04-p6-T6.6-ux.md`):** Waivers' "Suggested drop" column repeats the identical player name on all 75 rows -- correct by design (`computeLineupImpact` picks one roster-wide lowest-ROS-value player, independent of the candidate), just visually repetitive scrolling down a long list. Candidate frontend fix: show it once near the top, repeat inline only when a row's suggestion differs, or add an inline qualifier like "Suggested drop (lowest value overall)".

### Carried from Phase 5

Full detail and fully-fixed history: `docs/archive/progress-phase5.md`, `docs/reviews/2026-10-03-p5-batch{A,B,C2,C3,D,E}-{code,ux}.md`, `docs/reviews/2026-10-03-G5-{code,ux}.md`.

- **Resolved at Phase 6 (T6.3c): desktop density and "You" markers across League's 6 sections, and `manager-tendencies.tsx`'s pluralization.** Matchup's swing-players list is still single-column at every breakpoint (T6.3c's scope was curated to League only, ADR-017 item 2) -- still open if desktop density there is wanted.
- **Score-range chart's "your" median dot** (`text-primary`, lime) measures only 1.18:1 against the white card in light mode -- same class of contrast issue the chart's line-stroke Major already fixed (now 3.35-8.95:1), but the dots were out of that fix's scope. Candidate: swap to `text-highlight`.
- Win probability is shown three times in quick succession on Home + Matchup (banner sentence, "YOU" card, "TIE" card) with no added information -- consider one compact three-segment probability bar instead. Swing-player rows have no tap-through to player detail, unlike most other recommendation rows in the app.
- **Pre-existing real-data gap, surfaced fixing a Phase 5 bug:** `lineup.ts`'s `isBye`/`byeWeek` logic (now also inherited by `matchup.ts`) compares a player's raw Sleeper team code against an nflverse-coded schedule without the `LAR` -> `LA` conversion ADR-006 documents elsewhere in the same file -- a Rams player's bye week may not register as a bye in Lineup or Matchup. Not introduced by Phase 5.
- **Minor code-quality items, all documented in their source review:** `sim/matchup.ts`'s `NO_DRAW = -1` sentinel overlaps a representable real `sd` value (prefer a boolean flag); `playoff-odds.ts` has no perf smoke test for its ranking sort (manually benchmarked ~33ms for 12 teams/7 weeks, no regression guard); `roster-strength.test.ts`'s cache-invalidation test triggers the wrong (but still-correct) sync job; `matchup.ts`/`roster-strength.ts` don't recompute `freshness` on a cache hit (matches `lineup.ts`'s existing pattern); `LeagueIntelligencePlayoffOddsSchema`'s doc comment understates when `playoffOdds` is null; `league-intelligence.ts`'s `populationStandardDeviation` duplicates a `packages/core` private helper instead of it being exported; `league/_components/format.ts`'s `sortByPlayoffPctDesc` is unused dead code; two stat figures lack `tabular-nums`; a few undocumented magic-number thresholds (luck sign cutoff, heatmap tone bands).
- **`apps/web/components/sparkline.tsx` has the same sr-only-table pattern that caused two real, fixed 390px overflow bugs this phase** -- hasn't overflowed yet only because its content stays under 390px today. Proactively wrap with `[contain:layout]` whenever this file is next touched.
- **Route JS soft-target (170,000 B) regressions this phase:** League (178,897 B) and League/teams/[rosterId] (179,534 B) newly crossed the soft target (both well under the 204,800 B hard cap). 7 of 15 routes now over soft target, up from 4 at G4. Worth a dedicated look if Phase 6 adds more client code to any of these.
- **`pnpm test:e2e` (354 tests, UI1) and `pnpm test:a11y` (350 tests, UI2) run almost entirely overlapping test sets** (350 of 354 shared), roughly doubling e2e wall-clock time for limited marginal coverage. Worth a maintainer look at a true axe-only UI2 filter.
- **Informational Brier-score calibration isn't computable from the recorded fixture** (no week has both a stored pregame projection and a completed outcome). A real `./data` database would support it naturally; closing this needs either a richer recorded fixture (sleeper-data-engineer) or a one-off manual analysis outside the committed test suite (never committed, per ADR-009).

### Carried from Phase 2

- **Phase 3 design follow-ups (Steph, G2):** scoreboard hero on Home and My Team (large tabular Record, PF, Rank strip); lime on one content item per page (top recommendation). Home standings snippet "You" should use the purple badge like League. Settings route JS 169,200 B of the 170 KB target (800 B headroom); `/dev/gallery` 193,866 B of the 200 KB budget.
- **Frontend:** player-row primitive caps at `md:max-w-2xl` for other consumers; desktop header shows "League" briefly before the team name hydrates; dark your-row purple bar is 2.52:1 against accent-soft (fine against the ground, You badge carries text); missing `favicon.ico` (with the PWA work); not-found page has no h1 (add `level` prop to `EmptyState`) and no app chrome; every StaleBanner renders its own Sync now; Suspense fallback may shift layout; no shared Input/Select; reserve a stat slot in roster rows (Phase 3 points); Settings cannot re-run setup for the same username (consider "Re-check my account"); "Still syncing" has no auto refresh; layout DB-error catch and `app/error.tsx` untested at runtime; `lib/client/api.ts` imports schemas from `app/onboarding/_components/schemas`; overlay fade under reduced motion.
- **Worker:** an invalid configured username makes one failing user-id lookup per cycle (G2-B1).
- **Tests (qa-engineer):** e2e for `header-title-mobile`, `settings-sync-info`, the desktop "League / <team>" label; gallery states not asserted one by one; NAV-6 mocks the league-switch POST (real switch and "Still syncing" not in e2e); stale and preseason states not in e2e; two-fast-clicks week path has no e2e; not-found tests are skipped when a main-suite test fails (Playwright dependencies) and must be stressed with `--workers=1`; TEAM-3 option (a), a server-side pre-check, remains possible if the flake ever matters outside tests.
- **Tooling (devops-engineer):** `geist` dependency unused; `.playwright-mcp/` not in `.gitignore`; `pnpm screens` cannot capture 404 routes; two `start-standalone.mjs` at once race on copying `.next/static`; temp seeded DATA_DIRs are never cleaned up; `scripts/lib/seed.ts` may not forward `--no-identity`; `next/font/google` needs network at build time (works in Docker today).

### Data and backend

- **G2 code review minors (backend-engineer, `docs/reviews/2026-10-02-G2-code.md`).** m1 wrap `startOnboarding` writes in an immediate transaction; m2 seed env identity once at boot instead of on GET (busy_timeout already set); m3 zod or column test for `league-views.ts` row casts; m4 cache the player-search owner map if profiles show it; shared response schemas for `/api/onboarding/league` and `PATCH /api/settings`; a route-listing test that every mutating route uses `guardedWrite`. After a Settings league switch, `/onboarding` has no `syncSince`. Client schemas import shared by deep path (consider `@sideline/shared/schemas`).

- Raw SQL to `@sideline/db` helpers: apps/web reads (`h.sqlite.prepare`), worker `failUnknownJobs` and `seedLastAttempts`, `requestSyncForLeagueChange` (add `enqueueFresh`). Make `claimNext`/`toRequest` tolerant of unknown jobs, then drop the worker's raw UPDATE.
- `rosters` has no division column, so standings `division` is always null (migration plus worker mapping).
- Non-ASCII player search (normalized search name). PATCH settings schema is local to apps/web, not shared.
- Share the "No Sleeper user with that username" text as a constant between worker and web.
- Onboarding jobs write no `sync_runs` rows (`latestRunPerJob`/`startRun` are SyncJobName-only). `RawLeagueSchema` has no `avatar`.
- Degraded nflverse is stored as `skipped` (no `degraded` status, no note column). `league_player_week_points` and `defense_vs_position` not in `JOB_TABLES` (T3.2).
- packages/db: declare zod and tsx; `cli/migrate.ts` has no unit test.
- `SIDELINE_VERSION` must track the package version; consider `etag: false` for regular stats and projections (keeps multi-MB bodies out of http_cache).

### Worker and providers (sleeper-data-engineer)

- **No worker job ever calls `upsertUsageWeek` (found by T4.5b, confirmed by the orchestrator via `grep -rn "upsertUsageWeek" apps/worker/src/`: zero hits outside tests).** `packages/providers/src/usage.ts`'s `joinUsage` already computes Sleeper-matched usage rows from nflverse data, but `apps/worker/src/jobs/data-jobs.ts`'s `nflverseJob` never persists them to the `usage_week` table. Practical effect on real data: TREND-2 (usage trend) and T4.5b's usage-trend Waiver Score component silently fall back to a scoring-trend proxy for every player, all the time, not just when nflverse is disabled. Needs a worker-job fix (sleeper-data-engineer) wiring `joinUsage`'s output into `upsertUsageWeek`. Still open at v1.0.0; top candidate for Phase 7.

- p1 Batch B m2, m3, m7: providers cache meta zod, atomic cache writes, season_type filter; m5 stats rows without gp are did-not-play (T3.1); m6 document starters "0" as an empty slot.
- p1 Batch E m1 to m4: `storeState` in one transaction; recompute changed tables includes failed jobs with rowsChanged > 0; zod for the fixture manifest; test that a real gametime replaces an approximate kickoff.
- T1.5c: compute the ADR-002 fallback kickoff when gametime is missing; with nflverse off no fallback rows exist.
- T1.4a m6/m8: nflverse recorder `--refresh`, size check, fetch timeout, zod for release JSON, write-then-swap.
- Injectable `sleep` in `makeClient` (sturdier backoff tests; the 503 retry test takes about 4 s). apps/worker has no `test` script (devops).

### Carried from Phase 4

Full detail and fully-fixed history: `docs/archive/progress-phase4.md`.

- `DROP_PLAYER_NOT_ON_ROSTER` (`packages/core/src/waiver/lineup-impact.ts`) carries a raw Sleeper player id in its `value` instead of a name (same class as the fixed `SUGGESTED_DROP` bug, `73f0897`). Rare path (an explicit invalid drop-player override); fix if it ever shows in the UI.
- Fullback-position players render with a generic "FLEX" badge (pre-existing `PositionBadge`/`normalizePosition` fallback, not introduced by Phase 4, now visible since Players surfaces the full player pool).
- No per-week matchup grades for waiver candidates (`WaiverCandidateSchema` only has one schedule percentile folded into a Waiver Score reason); T4.6a shows one aggregate grade instead of three. Backend-engineer follow-up if per-week grades are wanted on Waivers.
- Players list has no "rostered by / free agent" field (unlike the search endpoint's `PlayerSearchResult.owner`) and no ROS value at list scope (by T4.5c's own documented design, deferred to keep the list fast); player detail has no forward schedule/opponent data, so T4.6b shows "not available yet" for "next 4 opponents" instead of fabricating it.
- `WAIVER_SCORE_*` reasons' `impact` is a 0-100-scale weighted-score contribution, not fantasy points, but `formatImpact` renders it identically to real point impacts elsewhere ("+40.0 pts") -- could misread as a fantasy-points claim in the Waiver Score breakdown sheet. Candidate reason-format.ts follow-up (and/or a per-reason-code formatting hint).
- `data-testid="waivers-row"` is shared by both the card and table DOM nodes (only one visible per breakpoint via CSS), unlike `players-row`/`players-table-row`'s distinct ids -- a future e2e test must scope within `waivers-table`/`waivers-cards` or assert `toBeVisible()`, not just count matches.
- `packages/core/package.json` has no `"test"` script (only `"typecheck"`), so `pnpm --filter @sideline/core test` silently no-ops instead of erroring (devops-engineer).
- **T4.3 Docker image size is ambiguous: `docker images` reports 551 MB, but the `CONTENT SIZE` column (unique layers added by this repo's Dockerfile, excluding the shared base image) is ~124-130 MB (G4: 123.6 MB arm64, 124.4 MB amd64)** -- the latter is the number directly comparable to G1-G3's ~100.8 MB web-only figure. T6.2 (HOST-5, 400 MB budget, multi-arch CI) must settle on one measurement method before enforcing the budget; `better-sqlite3` prebuilds and `sharp` are still untrimmed.
- `apps/web/lib/server/lineup.ts`'s private `readPlayers`/`readRoster` duplicate logic now available as `packages/db`'s `readPlayers`/`readRosteredPlayerIds` (T4.5a) -- a future cleanup could switch `lineup.ts` over.
- T4.8b's `PRIORITY_VALUE_BREAKDOWN` reason dropped its formula breakdown from `label` (now a short one-line summary) in favor of short chip copy; the numeric inputs (`positionFactor`/`weeksFactor`/`valueOfPriority`) are still on `ClaimAdviceResult` for a future render if Steph wants the detailed math visible.
- T6.2 follow-ups from T4.3, PUID/PGID default mismatch fixed at T6.2 (`6c2b9f3`): a bare `docker exec <c> whoami` returns `root` by design -- gate verification scripts must use `docker top` or `docker exec -u <uid>:<gid>`, not `whoami`, to check non-root; PUID/PGID chown was verified on a named Docker volume and a real Linux host, not a macOS bind mount. No `SIGTERM`/`SIGINT` trap in the entrypoint (hard kill instead of graceful drain on `docker stop`); unconditional `chown -R` on every boot instead of only when ownership is already wrong.
- **G4 gate code review (m3):** `apps/web/lib/server/waivers.test.ts`'s only end-to-end `nextClearAt` assertion for T4.9's DST fix uses a January (EST) date, so the DST branch itself isn't exercised at the web-integration layer (only at `packages/core`'s unit/golden level, which is thorough). Low risk, candidate qa-engineer follow-up: add an EDT-dated integration case.
- **Route JS over the 170,000 B soft target (all under the 204,800 B hard budget), confirmed at the G4 gate:** Lineup 178,893 B, Waivers 191,364 B, Players list 178,260 B, Players detail 193,914 B (least headroom, ~5.3%). Worth revisiting the soft target's realism for feature-dense routes if Phase 5 adds more client code to any of these.

### Tests and tooling

- FIX-CLOCK review minors (ADR-019): devops-engineer to confirm the `instrumentation.ts` include in `apps/web/tsconfig.json`; consider a startup log line on the worker too when the game clock is pinned (it ignores the value today).
- PERF-1 review minors (`docs/reviews/2026-10-06-PERF-1-code.md`): equivalence tests lack null-position, other-league/season and null-score rows (qa or backend); optional covering index for the per-week rank subquery; `readPlayerUsageWeeks` could `ORDER BY week` (backend).
- tests/fixtures/README.md: extra manifest keys, fake id ranges, short-name word-boundary rule, Lighthouse script-size unit (qa).
- p1 Batch F m1 iteration guard in `drive()`; m2 RATE-1 comment. p1 Batch D m7 contract suite header comment (qa).
- `pnpm gate --only=...` overwrites `latest.json` (write `latest.partial.json`); UI3 should wait for port 3000 to be released (devops).
- `reuseExistingServer: !CI` can reuse a stale local server (qa).
- CONTRACT_PLAYERS=1 widens the contract include; CONTRACT-3 body not run live yet.
- `pnpm fixtures:check` needs the raw cache or live API, so it can't run in CI; the orchestrator runs it at commits touching fixtures and at gates.
- Fixtures about 5.9 MB of a 6 MB target: re-record with trimming, not growth.
- pnpm peer-dependency warning on install not investigated; @types/better-sqlite3 9.6.0 may lag v13.

### Carried from Phase 3

Full detail and fully-fixed history: `docs/archive/progress-phase3.md`.

- `scheduleAlreadyStored` (`apps/worker/src/jobs/data-jobs.ts`) uses a raw SQL query instead of a typed `packages/db` helper, inconsistent with its siblings `readStoredStatsWeeks`/`readStoredProjectionWeeks`.
- Two UX Minors (deferred by Steph): Lineup's summary banner says "projected" even in Safe/Upside mode; "this is your team" uses two different badge variants on the same Home page (`variant="accent"` vs `variant="you"`) -- standardize on `variant="you"`. (A third item, "no zero-delta floor like Home's `hasSwaps` guard," turned out to be a real bug, not just a display Minor -- fixed by T6.8/T6.9/T6.12, see Phase 6's task table.)
- `packages/db`'s `computed_cache` keys only on data-input timestamps, never algorithm version, so a running instance could keep serving a pre-fix cached lineup until the next relevant sync. Related: the lineup cache (`getLineup`, T3.7) doesn't invalidate on an nflverse-only sync (ADR-013 item 19) -- zero impact today since alpha/beta is confirmed 0 by the real G3 backtest; revisit together if a future backtest ever ships non-zero alpha/beta.
- Low-priority, pre-existing, not blocking: `matchupMultiplier`'s own clamp/avg-unavailable reasons aren't surfaced in the player DTO; a `schedule` coverage gap for a team/week silently reads as "not locked"; a player missing from `players` or a zero-eligible-player roster are handled defensively but untested; `applyAvailability` runs twice with identical inputs; `matchupGrade` has no `totalTeams === 0` guard; `defense_vs_position`'s worker hook recomputes every week from scratch (O(W^2), negligible at NFL scale); `solve.ts`'s `TIEBREAK_EPSILON` undocumented at unrealistic magnitudes; `validate.ts` reads one player-week at a time (fine for a manual script); `rescoreProjection`'s `stats` parameter has no nominal type separating a projection row from a real stats row.

### Later phases

- No testing-library/jsdom: components have mapping tests only.
- `docker-compose.yml` forwards only TZ, APP_PASSWORD, SESSION_SECRET, PUID and PGID (no `env_file`), so other `.env` vars such as SLEEPER_USERNAME are ignored under compose, and TZ falls back to UTC rather than the app's America/New_York default. Docs now say so; consider adding `env_file` (devops).
- Docker (devops): trim better-sqlite3 prebuilds and sharp; consider failing the healthcheck on a stale worker heartbeat.
- Remove the next@16.3.8 `minimumReleaseAgeExclude` from `pnpm-workspace.yaml` once it ages out (devops). `themeColor` in `apps/web/app/layout.tsx` is fixed at `#2a2a2a` and ignores the in-app theme toggle (frontend).
- P1: nflverse play-by-play for red-zone touches (TREND-2).
- **Feature request (Steph, G4 reply 2026-10-03): Players detail page should show a player's prior performance this season and news about them.** TREND-1 (season/L3 PPG, weekly series) and TREND-2/3/5 (usage, consistency, Sleeper momentum) already compute most of the "prior performance" data; `apps/web/app/l/[leagueId]/players/_components/player-detail-view.tsx` (T4.6b) may already render some of this -- check what's shown today before scoping a follow-up task. "News about them" (headlines, beat-writer notes) is a new data source not yet in PLAN.md's provider list (3.1-3.3) -- would need its own spike (candidate provider, rate limits, caching) before implementation. Candidate Phase 7 (P1) item; not scoped or estimated yet.
- **Feature request (Steph, 2026-10-03): trade analyzer/proposer to identify roster gaps and suggest trades likely to be accepted.** Already roadmapped as TRADE-1/TRADE-2 (PLAN.md 5.9, Phase 7 P1): TRADE-1 evaluates a proposed trade by the real change in both teams' ROS optimal lineup projection and playoff odds (not raw player-value sums); TRADE-2's finder already does gap-identification, suggesting 1-for-1 and 2-for-1 trades using complementary positional needs from LEAGUE-4's positional-strength heatmap. **New nuance from this request, not yet in the PLAN.md spec: predicting whether a proposed trade is "likely to be accepted" by the other team**, not just whether it's good for both rosters. Candidate signal sources once LEAGUE-6 (manager tendencies: trade count, transaction activity) and this season's real completed trades exist: does the other team's own ROS-optimal-lineup also improve (today's TRADE-2 filter, a baseline fairness proxy); has that manager historically accepted similarly-shaped trades; is the asset in a position that team's heatmap shows as a strength they might undervalue losing versus a weakness they're trying to fill. Needs its own design pass at Phase 7 planning time, not scoped or estimated yet -- log as a PLAN.md 5.9 amendment then (ADR-lite entry) rather than guessing the mechanism now.

## Questions for Steph

- None open.
