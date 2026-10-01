# PLAN.md: Sideline, a Self-Hosted Fantasy Football Analyzer for Sleeper

Version 1.0 of the plan (October 2026). Owner: Steph. Orchestrator: Opus. Implementers: Sonnet subagents (see CLAUDE.md).

## 0. How to use this document

- Sections 1 to 8 define **what** to build. Sections 9 to 11 define **how and in what order**. Section 12 covers risks; section 13 lists open questions for Steph.
- Requirement IDs (e.g. `LINEUP-3`) are stable references. Use them in task briefs, test names, commits, and gate reports.
- If reality contradicts this plan (especially the Sleeper data assumptions in section 3), the Phase 0 spike findings in `docs/sleeper-api-notes.md` win. Update this plan and log the change in `docs/DECISIONS.md`.
- The 2026 season is in progress. Phases 0 to 4 are ordered to deliver the in-season MVP (lineup optimizer and waiver tools) as early as possible.

## 1. Product summary

Sideline connects to a Sleeper league (read-only; Sleeper's API is public and needs no login) and turns league data into decisions: who to start, who to pick up, how much to bid, and where every team stands. It runs as a single Docker container on a home server.

### Problem

The Sleeper app presents data well but leaves the analysis to you. It does not optimize lineups against matchups under your league's exact scoring, quantify what a waiver pickup would add to your actual starting lineup, suggest FAAB bids based on how your league actually bids, simulate win probability, or estimate playoff odds.

### Goals (v1)

- **G-1 Fast weekly decisions.** Open the app and within 2 minutes see lineup issues, the optimal lineup, and the top 3 waiver targets for your team.
- **G-2 Explainable.** Every recommendation shows the reasons and numbers behind it in one tap.
- **G-3 Faithful to the league.** Recomputed fantasy points match Sleeper's official scores for at least 99% of player-weeks.
- **G-4 Honest models.** Any matchup adjustment must beat raw projections in a backtest on this season's completed weeks, or it is shown as context only.
- **G-5 Great on a phone.** Lighthouse mobile Performance at least 85 and Accessibility at least 95; every core flow usable one-handed at 390px wide.

### Non-goals (v1)

- **Writing to Sleeper** (setting lineups, submitting claims). The API is read-only. We show exact swaps and link out to Sleeper.
- **Multi-user accounts or SaaS.** Single household, optional shared password.
- **Paid data sources by default.** Optional integrations only, behind config.
- **News scraping or LLM-written analysis.** All insight is computed and deterministic (an opt-in LLM recap is P2).
- **Other platforms** (ESPN, Yahoo). Keep a provider interface so they could be added; don't build them.
- **Draft tools this season.** P2, for 2027.

## 2. Users and key stories

Primary user: a league manager checking on her phone during the week and on Sunday mornings, plus desktop deep dives on waiver night. Leaguemates may view it if she shares the URL; league-wide views are fine for anyone.

Stories, in priority order:

1. As a manager on Sunday morning, I want to see whether any starter is out, on bye, or worse than a bench option for this week's matchup, so I fix my lineup before kickoff.
2. As a manager on waiver night, I want free agents ranked by how much they would improve my actual starting lineup over the next few weeks, with a suggested FAAB bid and who to drop.
3. As a manager, I want to see players whose usage is rising before their points spike.
4. As a manager, I want my win probability this week and which players swing it.
5. As a manager, I want power rankings, luck, and playoff odds for the whole league.
6. As a manager, I want to look up any player and see weekly scoring in my league's format, usage trends, and upcoming schedule difficulty.

Edge cases every relevant feature must handle: preseason and offseason state; bye weeks; Thursday or Saturday games already locked; players with no projection; IR and taxi slots; superflex and multiple flex types; IDP slots if present; ties; leagues without FAAB; divisions; managers with no team name; week 18 and playoff weeks; mid-week roster changes.

## 3. Data sources

### 3.1 Sleeper documented API (core, required)

Base URL `https://api.sleeper.app/v1`. Public, read-only, no auth. Docs: https://docs.sleeper.com. Sleeper asks clients to stay under 1000 calls per minute (IP block risk). **Our budget:** under 60 calls per minute steady state, hard cap 300 per minute in the limiter.

| Endpoint | Use | Default refresh |
|---|---|---|
| `GET /state/nfl` | season, week, season_type, display week | 15 min |
| `GET /user/{username}` | resolve user_id at onboarding | on demand |
| `GET /user/{user_id}/leagues/nfl/{season}` | league picker | on demand, daily |
| `GET /league/{league_id}` | settings, `scoring_settings`, `roster_positions`, playoff settings, `previous_league_id` | hourly |
| `GET /league/{league_id}/users` | managers, team names (`metadata.team_name`), avatars | hourly |
| `GET /league/{league_id}/rosters` | players, starters, reserve (IR), taxi, record, FAAB used | 15 min; 5 min in game windows |
| `GET /league/{league_id}/matchups/{week}` | matchup pairs, starters, `players_points`, team points | 15 min; 2 min for current week in game windows |
| `GET /league/{league_id}/transactions/{week}` | adds, drops, trades, waiver bids | 15 min |
| `GET /league/{league_id}/traded_picks` | keeper/dynasty context | daily |
| `GET /league/{league_id}/winners_bracket`, `/losers_bracket` | playoff brackets | hourly in playoffs |
| `GET /league/{league_id}/drafts`, `GET /draft/{draft_id}/picks` | draft recap (P1) | daily |
| `GET /players/nfl` | full player database (about 14.7 MB raw, 2.25 MB gzip; ADR-002). Sleeper asks for at most one call per day. | daily, off-peak |
| `GET /players/nfl/trending/{add\|drop}?lookback_hours=24&limit=50` | league-wide add/drop momentum | 30 min |

Avatars: `https://sleepercdn.com/avatars/thumbs/{avatar_id}`.

### 3.2 Sleeper undocumented endpoints (verify in Phase 0; wrap in a provider interface)

Widely used by community tools but not officially documented; they can change without notice. Features depending on them must degrade gracefully ("projections unavailable this week") rather than crash.

- Weekly projections: `https://api.sleeper.app/projections/nfl/{season}/{week}?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF`
- Weekly stats: `https://api.sleeper.app/stats/nfl/{season}/{week}?season_type=regular&position[]=...` (same params)
- Player headshots: `https://sleepercdn.com/content/nfl/players/thumb/{player_id}.jpg`

Phase 0 findings are in `docs/sleeper-api-notes.md` and ADR-002 (projections need `season_type` and contain placeholder rows; no kickoff times in Sleeper; 2025 data available for backtests). Phase 0 had to confirm and document: response shapes; whether stat keys align with `scoring_settings` keys (expected: keys like `pass_yd`, `rec`, `rec_yd`, `bonus_*` share names); whether opponent and game info is included; how DEF and K stats are keyed; whether future-week matchups exist (for playoff odds); the `waiver_type` codes in league settings; and any source of kickoff/lock times.

### 3.3 Supplementary sources (optional, feature-flagged)

- **nflverse data** (free and open, published as GitHub releases of `nflverse/nflverse-data`): schedules (opponents, byes, home/away, roof, and usually spread/total lines), weekly player stats including targets and air yards, and snap counts. Used for usage trends, schedules, and implied team totals. Enabled by default; the app must keep working if it's disabled or a download fails (fall back to Sleeper-only metrics).
- **Open-Meteo** (free, no key): game-time wind and precipitation for outdoor stadiums. P1.
- **The Odds API** (needs a key): only if `ODDS_API_KEY` is set. Prefer implied totals derived from nflverse schedule lines (free). Verify the spread sign convention against a known game in Phase 0.

### 3.4 Data freshness rules

- Every page shows "Updated N min ago" from the latest successful `sync_runs` row for the data it displays.
- Data older than 2x its refresh cadence shows a non-blocking stale banner.
- Game windows come from nflverse schedule kickoff times (Sleeper has none, ADR-002; fallback: Thu 8pm to midnight, Sun 1pm to midnight, Mon 8pm to midnight Eastern; configurable). NFL logic runs in America/New_York internally; display uses `TZ`.

## 4. Architecture

### 4.1 Stack (pin exact versions in ADR-001 during Phase 0; use current stable releases)

- **Language:** TypeScript (strict) everywhere, so every agent works in one language.
- **Monorepo:** pnpm workspaces.
- **Web:** Next.js App Router with `output: 'standalone'`; React Server Components by default.
- **UI:** Tailwind CSS, shadcn/ui (Radix primitives), lucide-react icons, Recharts (lazy-loaded), TanStack Table.
- **Database:** SQLite in WAL mode via better-sqlite3, Drizzle ORM, drizzle-kit migrations.
- **Worker:** separate Node process (`apps/worker`) running scheduled sync jobs (croner or node-cron).
- **Validation:** zod at every external boundary.
- **Testing:** Vitest with coverage, fast-check (property tests), MSW (HTTP mocking), Playwright, @axe-core/playwright, Lighthouse CI.
- **Logging:** pino (JSON in production, pretty in dev).
- **Container:** one image, two processes (web and worker) under a small supervisor entrypoint, with tini as PID 1.

Rationale: one container is ideal for Unraid; SQLite needs no extra service; keeping analytics as pure TypeScript functions makes them easy to test exhaustively.

### 4.2 Repo layout

```
apps/
  web/              Next.js app (UI, plus route handlers under app/api)
  worker/           sync scheduler and jobs
packages/
  shared/           domain types, DTOs, zod schemas for our own API (the contracts)
  sleeper/          Sleeper API client, response schemas, rate limiter
  providers/        supplementary providers (nflverse, weather, odds)
  db/               Drizzle schema, migrations, query helpers
  core/             pure analytics: scoring, projections, optimizer, trends, waivers, sims
tests/              integration tests and fixtures (tests/fixtures/sleeper/...)
e2e/                Playwright specs
scripts/            gate, screens, fixtures recording, backtest, scoring validation
docker/             entrypoint and supervisor
unraid/             Unraid template XML
docs/               PROGRESS, DECISIONS, gates, reviews, backtests, sleeper-api-notes, self-hosting
```

### 4.3 Data flow

Worker jobs call the Sleeper client (rate-limited, zod-validated), upsert into SQLite, then recompute derived tables (league-scored points, defense vs position). The web server's data functions read SQLite and call `packages/core`; server components render, and route handlers return JSON for client interactions. Expensive computed results are cached in `computed_cache` keyed by (league_id, week, kind, inputs_hash) and invalidated when a sync run changes their inputs.

### 4.4 Configuration (env, validated with zod at startup; fail fast with a clear message)

| Variable | Default | Notes |
|---|---|---|
| `SLEEPER_USERNAME` | none | Optional; onboarding UI can set it |
| `DEFAULT_LEAGUE_ID` | none | Optional |
| `DATA_DIR` | `/data` | SQLite, caches, backups |
| `TZ` | `America/New_York` | Display timezone |
| `APP_PASSWORD` | none | Enables password login when set |
| `SESSION_SECRET` | none | Required if `APP_PASSWORD` is set; at least 32 chars |
| `PUID` / `PGID` | `1000` / `1000` | File ownership on `/data` (Unraid typically 99/100) |
| `ENABLE_NFLVERSE` | `true` | |
| `ODDS_API_KEY` | none | Optional |
| `SYNC_*_CRON` | see 3.1 | Per-job cadence overrides |
| `LOG_LEVEL` | `info` | |
| `PORT` | `3000` | |

### 4.5 Data model (initial; backend-engineer finalizes in Phase 1)

- `app_settings(key, value)`
- `leagues(league_id, season, name, status, settings_json, scoring_json, roster_positions_json, previous_league_id, synced_at)`
- `league_users(league_id, user_id, display_name, team_name, avatar)`
- `rosters(league_id, roster_id, owner_id, players_json, starters_json, reserve_json, taxi_json, wins, losses, ties, fpts, fpts_against, waiver_budget_used, synced_at)`
- `players(player_id, full_name, position, fantasy_positions_json, team, status, injury_status, injury_body_part, age, years_exp, depth_chart_order, search_rank, updated_at)`
- `player_week_stats(season, week, player_id, stats_json, source)`
- `player_week_projections(season, week, player_id, stats_json, source, fetched_at)`
- `league_player_week_points(league_id, season, week, player_id, actual_pts, proj_pts)` (derived)
- `defense_vs_position(season, through_week, team, position, pts_allowed_pg, games)` (derived, per league scoring)
- `matchups(league_id, week, roster_id, matchup_id, starters_json, players_points_json, points)`
- `transactions(league_id, transaction_id, week, type, status, adds_json, drops_json, waiver_bid, roster_ids_json, created_at)`
- `schedule(season, week, game_id, home, away, kickoff_utc, roof, spread_line, total_line)`
- `usage_week(season, week, player_id, snap_pct, targets, target_share, air_yards_share, carries, carry_share, rz_touches)`
- `trending(player_id, type, count, lookback_hours, fetched_at)`
- `sync_runs(id, job, started_at, finished_at, status, calls_made, rows_changed, error)`
- `computed_cache(league_id, week, kind, inputs_hash, payload_json, computed_at)`

## 5. Analytics specification (`packages/core`)

All functions are pure. Inputs are passed explicitly (including "now" and RNG seeds). Outputs include `reasons: Reason[]` where `Reason = { code, label, value?, impact? }`, which the UI renders as chips and "why" sheets.

### 5.1 League scoring engine (SCORE)

- **SCORE-1** `points(stats, scoringSettings)` = sum over keys present in both of `stats[k] * scoringSettings[k]`, plus any key-mapping exceptions found in Phase 0 (documented in `docs/sleeper-api-notes.md`).
- **SCORE-2** Validation harness (`pnpm validate:scoring`): for every completed week this season, recompute each starter's points from weekly stats and compare with `matchups.players_points`. Target: absolute difference at most 0.01 for at least 99% of player-weeks. The report lists mismatches and the stat keys suspected.
- **SCORE-3** Rescore projections the same way, so every projection in the app is in the league's exact format.

### 5.2 Projections and uncertainty (PROJ)

- **PROJ-1** Base projection: Sleeper weekly projection rescored via SCORE-3. Missing projection means value 0 with reason `NO_PROJECTION`, flagged in the UI.
- **PROJ-2** Weekly standard deviation per player from league-scored weekly results (this season, plus the 2025 season from Sleeper's stats endpoint rescored with the league's scoring, ADR-002), shrunk toward the position-level coefficient of variation: `sd = w * sd_player + (1 - w) * cv_pos * proj`, with `w = n / (n + k)`. Start with `k = 6`; tune in backtest.
- **PROJ-3** Floor and ceiling are the 20th and 80th percentiles, using a normal approximation truncated at 0 (or empirical quantiles when `n >= 10`).
- **PROJ-4** Rest-of-season (ROS) projection: sum of available weekly projections for remaining regular-season weeks; otherwise season PPG times games remaining times matchup multipliers, labeled as an estimate.

### 5.3 Matchup adjustment (MATCH)

- **MATCH-1** Defense vs position (DvP): for each NFL defense and position, league-scored points allowed per game this season, with the last 4 weeks weighted 2x, shrunk toward the league position average with `k = 4` games.
- **MATCH-2** Multiplier `m = 1 + alpha * (DvP_opp_pos / avg_pos - 1)`, plus an optional implied-total term `beta * (implied_team_total / league_avg_total - 1)` when available. Cap `m` to [0.85, 1.15].
- **MATCH-3** Backtest (`pnpm backtest`): over the 2025 season (rescored with this league's scoring) plus completed 2026 weeks (ADR-002), for each completed week `w >= 4`, build projections using only data available before week `w`. Compare MAE and within-position Spearman rank correlation of raw versus adjusted projections. Grid-search `alpha` and `beta` in [0, 1]. Ship the best values only if MAE improves by at least 1% over raw; otherwise set both to 0 and show matchup grades as context only. Save results to `docs/backtests/{date}.md` and log the decision in DECISIONS.md. Sleeper's projections likely already include matchup effects, so double counting is the main risk; the backtest is the guard.
- **MATCH-4** Display grade A to F (quintiles of DvP rank), always paired with a text label and the underlying number.

### 5.4 Lineup optimizer (LINEUP)

- **LINEUP-1** Slots come from `league.roster_positions`, excluding `BN`, `IR`, `TAXI`. Eligibility: QB, RB, WR, TE, K, DEF direct; `FLEX` = RB/WR/TE; `WRRB_FLEX` = RB/WR; `REC_FLEX` = WR/TE; `SUPER_FLEX` = QB/RB/WR/TE; IDP slots (`DL`, `LB`, `DB`, `IDP_FLEX`) if present. A player is eligible if any of their `fantasy_positions` fits. Unknown slot types are logged, treated as unfillable, and surfaced as a warning.
- **LINEUP-2** Exact solve as maximum-weight bipartite assignment (Hungarian algorithm) between slots and eligible rostered players (excluding IR and taxi). Weight is the player's value under the selected mode.
- **LINEUP-3** Locks: a starter whose game has kicked off stays in their slot; a bench player whose game has kicked off cannot be moved in. Kickoff comes from nflverse; without it, the ADR-002 fallback lock times apply and reasons mark the lock as approximate.
- **LINEUP-4** Availability: Out, IR, Suspended, or bye means value 0 and never recommended. Doubtful multiplies value by 0.25; Questionable by 0.9. Constants are configurable and always shown in reasons.
- **LINEUP-5** Modes: Projected (median), Safe (floor), Upside (ceiling). P1: Auto mode picks Upside when weekly win probability is below 35% and Safe above 65%.
- **LINEUP-6** Output: optimal assignment, current assignment, swap list (in, out, slot), projected point delta, per-player reasons (projection, matchup grade, status, bye, lock), and an issues list (empty slot, inactive starter, unknown slot type).
- **LINEUP-7** Performance: under 50 ms for any roster of 30 or fewer players.
- **LINEUP-8** Invariants (property tests): output is always a valid lineup; locked players never move; optimal value is at least the current lineup's value and at least the value of any randomly generated valid lineup.
- **LINEUP-9** Works for any roster in the league (read-only view of an opponent's best lineup).

### 5.5 Player trends and usage (TREND)

- **TREND-1** Per player: league-scored PPG for the season, last 3 weeks (L3), L3 minus season, and the weekly series.
- **TREND-2** Usage (when nflverse is enabled): snap %, target share, air yards share, carry share, red zone touches; L3 versus prior weeks delta. Show the position-relevant subset.
- **TREND-3** Consistency: coefficient of variation. Boom and bust are league-aware: let `N` be the number of startable players at the position across the league (from roster settings). A boom week is a top-`N` finish at the position; a bust week is a finish worse than rank `1.5 * N`.
- **TREND-4** Trend signal Rising, Steady, or Falling from the usage delta and L3 delta, with documented, tested thresholds.
- **TREND-5** Sleeper trending adds and drops (24h) shown as momentum.

### 5.6 Waiver wire (WAIVER)

- **WAIVER-1** Candidate pool: every player not on any roster in the league (including IR and taxi), with an active status and a position used by the league.
- **WAIVER-2** **Lineup Impact** (headline metric): for each candidate and each of the next `N` weeks (default 3), run the optimizer on my roster plus the candidate minus the suggested drop, and sum the projected starting points gained. Suggested drop: the lowest-ROS-value non-IR player on my roster; the user can override it. Prefilter to the top 75 candidates by a cheap composite before running impact. Target: under 2 s total.
- **WAIVER-3** Composite **Waiver Score** 0 to 100 from percentile-normalized components: Lineup Impact 40%, ROS value 20%, usage trend 20%, Sleeper momentum 10%, schedule next 3 weeks 10%. Weights are configurable and the breakdown is shown as chips.
- **WAIVER-4** Two views: "For my team" (sorted by Lineup Impact) and "Best available" (sorted by ROS value, independent of my roster). Position filters on both.
- **WAIVER-5 (moved to P2, ADR-003)** FAAB bid suggestion (FAAB leagues only, from `league.settings.waiver_type`; confirm codes in Phase 0): from this season's league transactions, collect winning bids as a percentage of the starting budget, grouped by Waiver Score quartile. Recommend Conservative (median), Likely to win (75th percentile), and Aggressive (90th percentile), scaled by my remaining budget fraction and weeks remaining. With fewer than 8 winning bids in history, fall back to documented default tiers and show reason `LIMITED_LEAGUE_HISTORY`. If failed bids are available in transactions, use them to sharpen the "likely to win" estimate.
- **WAIVER-6** Rolling-priority waiver advisor (non-FAAB leagues; Steph's league uses rolling waivers, ADR-003):
  - **WAIVER-6a** Show my current waiver position (from roster settings) and the full order.
  - **WAIVER-6b** For each candidate, flag teams ahead of me in the order with a roster need at the candidate's position (likely competing claims). "Need" means the candidate would enter that team's optimal lineup: that team's Lineup Impact for the candidate exceeds a documented, configurable threshold. Pending claims by other teams are not visible in the API; the signal may also use this season's failed-claim history (who competed for which positions), which transactions expose (ADR-002).
  - **WAIVER-6c** Claim advice: recommend whether a claim is worth dropping to the back of the order by comparing my Lineup Impact with a documented, configurable value-of-priority estimate (which depends on my position and weeks remaining). Always shown with reasons.
  - **WAIVER-6d** Show when waivers clear (from `waiver_day_of_week`, 0 = Monday, runs about 03:00 ET, and `waiver_clear_days`; ADR-002) and when unclaimed players become free agents (first come, first served).

### 5.7 Matchup win probability (SIM)

- **SIM-1** Monte Carlo, default 10,000 iterations with a seeded RNG. Each starter's score is drawn from a truncated normal around the mode-adjusted projection (sd from PROJ-2). Finished players are fixed at actual points. In-progress players: actual plus projection times the fraction of game remaining when game clock data is available; otherwise treat as actual plus full remaining projection, flagged as approximate.
- **SIM-2** Outputs: win probability, projected score p10/p50/p90 for both teams, and swing players (largest contribution to the variance of the score difference).
- **SIM-3** Performance: 10,000 iterations in under 300 ms for two 10-slot lineups.

### 5.8 League intelligence (LEAGUE)

- **LEAGUE-1** All-play record per team, per week and season.
- **LEAGUE-2** Luck = actual wins minus expected wins (sum of weekly all-play win rates).
- **LEAGUE-3** Power score = 0.4 x all-play win rate + 0.3 x recent points for (last 3 weeks, normalized) + 0.3 x roster strength (ROS optimal lineup projection, normalized). Weights shown in a tooltip.
- **LEAGUE-4** Positional strength heatmap: each team's ROS projected starters by position versus the league median.
- **LEAGUE-5** Playoff odds: simulate the remaining regular season 10,000 times using each team's weekly score distribution (mean from ROS optimal lineup projection, sd from season weekly scores) and the real remaining schedule (future-week `matchups/{week}` for weeks before `playoff_week_start`; later weeks are placeholders, ADR-002). Apply league playoff settings (`playoff_teams`, divisions if present, tiebreaker per league settings, defaulting to points for). Outputs: playoff %, bye % (if byes exist), seed distribution.
- **LEAGUE-6** Manager tendencies: transaction count, waiver claims won, trade count; FAAB spent and remaining plus average and max winning bid only in FAAB leagues.

### 5.9 Trade analyzer (TRADE, P1)

- **TRADE-1** Evaluate a proposed trade by the change in each team's ROS optimal lineup projection (not raw player sums) and the change in playoff odds.
- **TRADE-2** Trade finder: suggest 1-for-1 and 2-for-1 trades where both teams' ROS optimal lineups improve, using complementary positional needs from LEAGUE-4.

## 6. UX and UI specification

### 6.1 Principles

1. **Insight first, evidence second.** Each screen leads with the recommendation or the most important number, then the supporting data.
2. **Explainable in one tap.** Reason chips on every recommendation; tapping opens a "why" sheet with the numbers.
3. **Mobile-first.** Desktop gets more density, never different features.
4. **Calm design.** Neutral surfaces, one accent color, semantic colors only where they carry meaning (good or bad matchup, rising or falling), always paired with an icon or text.
5. **Fast.** Skeletons, not spinners. Most screens render server-side from SQLite.

### 6.2 Visual system

- Typography: Inter or Geist via `next/font`; `tabular-nums` for every stat; type scale 12/14/16/20/24/30.
- Themes: light and dark, defaulting to system, toggle in Settings. Tokens as CSS variables (shadcn convention).
- Spacing on a 4px grid. Radius: 12px cards, 8px controls.
- Position badges: one consistent color per position (QB, RB, WR, TE, K, DEF), contrast-checked in both themes, text label always present.
- Charts: minimal gridlines, accessible palette, and a visually hidden data table alternative for screen readers.
- Motion: subtle (150 to 200 ms), respects `prefers-reduced-motion`.

### 6.3 Navigation

- **Desktop (1024px and up):** left sidebar with Home, Lineup, Matchup, Waivers, Players, League, Settings; league switcher at the top; global search (Cmd/Ctrl+K).
- **Mobile (under 1024px):** bottom tab bar with Home, Lineup, Matchup, Waivers, More (Players, League, Settings). Search icon and week selector in the top bar.
- Every view is deep-linkable, e.g. `/l/{leagueId}/lineup?week=5&mode=safe`.

### 6.4 Screens

- **Onboarding:** enter Sleeper username, pick a league from the season list, watch initial sync progress, land on Home.
- **Home:** "This week" card (lineup issue count linking to Lineup, projected score vs opponent, win probability); top 3 waiver targets for my team; rising players (my roster and free agents); injury status changes since the last sync; standings snippet; data freshness.
- **Lineup:** mode toggle (Projected, Safe, Upside); current vs optimal side by side (stacked on mobile); swap list with point delta; reason chips per player; lock indicators; issues banner; "Open in Sleeper" button; optional toggle to view the opponent's optimal lineup.
- **Matchup:** win probability gauge; projected scores with p10 to p90 range; starters side by side with projections and live actuals; swing players; week selector.
- **Waivers:** tabs "For my team" and "Best available"; position filter; each row shows name, team, position, Waiver Score, Lineup Impact (+pts over next 3 weeks), trend signal, matchup grades for next 3 weeks, suggested drop, FAAB range. Tap opens the player sheet with the score breakdown.
- **Players:** searchable, filterable table on desktop and card list on mobile: rostered by whom or free agent, PPG, L3, trend, key usage stat, ROS value. Player sheet: weekly league-scored bars with projection line, usage chart, next 4 opponents with grades, status and injury, Sleeper momentum.
- **League:** standings (record, PF, PA, all-play, luck); power rankings; playoff odds; positional strength heatmap; transactions feed; manager tendencies. Team detail view for any roster (read-only, with its optimal lineup).
- **Settings:** league selection, username, theme, data source toggles, sync status per job (last run, errors, "Sync now" with rate limiting), version info.

### 6.5 States

Every data view implements loading (skeleton), empty (helpful message plus next action), error (what failed plus retry), stale (banner), and preseason/offseason (explain what's available).

### 6.6 Accessibility and performance budgets

- WCAG 2.1 AA. axe: zero serious or critical violations on every route in both themes.
- Full keyboard support, visible focus, focus trapped in sheets and dialogs.
- Touch targets at least 44 x 44 px.
- No horizontal page scroll at 390px wide.
- Lighthouse mobile: Performance at least 85, Accessibility at least 95, Best Practices at least 95.
- Route JS at most 200 KB gzipped (charts lazy-loaded).
- Server data functions p95 at most 300 ms on the fixture DB; waivers at most 2 s.

### 6.7 PWA

Web app manifest and icons; installable on iOS and Android in v1. Offline mode showing last-rendered data read-only is P1.

## 7. Self-hosting requirements (HOST)

- **HOST-1** One image runs web and worker. `docker run -p 3000:3000 -v /path:/data <image>` works with zero required env vars.
- **HOST-2** Runs as non-root; honors `PUID`/`PGID` for file ownership on `/data` (Unraid convention).
- **HOST-3** `HEALTHCHECK` hits `/api/health` (DB reachable, worker heartbeat, last sync status).
- **HOST-4** Migrations run automatically at start; the DB is backed up to `/data/backups` before migrating (keep the last 5).
- **HOST-5** Image at most 400 MB; multi-arch (amd64, arm64) build in CI.
- **HOST-6** `docker-compose.yml` example and an Unraid template (`unraid/sideline.xml`) with paths, port, and env vars documented.
- **HOST-7** Works behind Nginx Proxy Manager at a subdomain root; trusts `X-Forwarded-*` headers; secure cookies over HTTPS.
- **HOST-8** Optional `APP_PASSWORD` login: signed HTTP-only session cookie, 30-day expiry, login rate limit of 5 per minute per IP, constant-time comparison. Recommended whenever exposed outside the LAN.
- **HOST-9** `docs/self-hosting.md`: install, update, backup and restore, env reference, NPM proxy setup, troubleshooting.

## 8. Prioritization

- **P0, in-season MVP (Phases 0 to 4):** data sync; scoring engine with validation; projections; lineup optimizer and Lineup page; Waivers (Lineup Impact, Waiver Score, rolling-priority advisor WAIVER-6); Players and trends; League basics; Home; Docker beta.
- **P0, v1.0 (Phases 5 and 6):** matchup win probability; power rankings, luck, playoff odds; hardening; auth; PWA install; docs.
- **P1:** notifications via self-hosted Web Push to the installed iPhone PWA (VAPID keys generated locally, no paid service; Sunday-morning lineup issue alert, inactive starter alert); trade analyzer and finder; Auto lineup mode; weekly backtest job in the worker; weather; league history across seasons via `previous_league_id`; offline caching; "view as team" switcher for leaguemates.
- **P2:** FAAB bid recommender (WAIVER-5, ADR-003); 2027 draft assistant; dynasty and keeper values; other platforms; opt-in LLM weekly recap.

## 9. Phased build plan

Each phase lists tasks with ID, owner agent, dependencies, and parallel batch letter (tasks with the same letter run together, at most 3 at a time). The orchestrator turns each into a full Task Brief and may split tasks. Level 1 verification runs after every task; Level 2 reviews after every batch (CLAUDE.md section 4).

### Phase 0: Bootstrap and API spike (Gate G0)

Objective: working skeleton, tooling, and verified ground truth about the Sleeper API.

| ID | Task | Agent | Depends | Batch |
|---|---|---|---|---|
| T0.1 | Scaffold pnpm workspace per 4.2; TS strict base config; ESLint and Prettier; Vitest workspace; package skeletons; root scripts per 10.6 (stubs where not yet implementable); `.gitignore`, `.nvmrc`, `.env.example`; `docs/PROGRESS.md` and `docs/DECISIONS.md` skeletons | devops-engineer | none | A |
| T0.2 | Next.js app skeleton with `/api/health`; multi-stage Dockerfile skeleton (standalone output) that builds and serves health | devops-engineer | T0.1 | B |
| T0.3 | API spike: call every endpoint in 3.1 and 3.2 for Steph's account and league; write `docs/sleeper-api-notes.md` covering every open item in 3.2; build `scripts/fixtures/record.ts`; record sanitized fixtures for weeks 1 to current (policy in 10.5) | sleeper-data-engineer | T0.1 | B |
| T0.4 | Test harness: MSW handlers serving fixtures; Playwright config with projects `desktop-chromium`, `mobile-iphone` (WebKit, iPhone 13 profile), `mobile-pixel` (Chromium, Pixel 7 profile); axe helper; no-horizontal-scroll helper; Lighthouse CI config with 6.6 budgets; coverage thresholds per 10.5 | qa-engineer | T0.1 | B |
| T0.5 | `scripts/gate` (runs 10.1 checks, writes `docs/gates/latest.json`), `scripts/screens` (routes x 390/768/1280 x light/dark into `.screens/`), GitHub Actions CI running verify, tests, build, docker build | devops-engineer | T0.2, T0.4 | C |
| T0.6 | Review API notes; write ADR-001 (stack and pinned versions) and ADR-002 (data source decisions); amend PLAN.md where findings contradict it | orchestrator | T0.3 | C |

**G0 phase checks:** every endpoint in 3.1 and 3.2 marked verified, changed, or missing in the API notes with sample shapes; stat-to-scoring key mapping documented; fixtures recorded and sanitized (spot-check: no real usernames or team names); `pnpm verify` green; Docker skeleton builds and `/api/health` returns 200 in the container; ADR-001 and ADR-002 written. **Decision point:** if the projections endpoint is unavailable, the orchestrator picks the fallback in 12 and logs it before Phase 1.

### Phase 1: Data layer and sync (Gate G1)

| ID | Task | Agent | Depends | Batch |
|---|---|---|---|---|
| T1.1 | `packages/shared`: domain types and DTOs (league, roster, player, matchup, transaction, stats, projections, sync job types) | backend-engineer | G0 | A |
| T1.2 | `packages/sleeper`: typed client; zod schemas per endpoint (require used fields, tolerate extras); token-bucket rate limiter (default 5 req/s, hard cap 300/min); retries with exponential backoff and jitter on 429 and 5xx only; 10 s timeout; typed errors; unit tests with MSW | sleeper-data-engineer | T1.1 | B |
| T1.3 | `packages/db`: Drizzle schema per 4.5; migrations; WAL and `busy_timeout`; indexes; query helpers; `db:seed:fixtures` | backend-engineer | T1.1 | B |
| T1.4 | `packages/providers`: nflverse provider (schedules, weekly player stats and usage, snap counts) with download cache in `DATA_DIR`, schema validation, feature flag, graceful failure | sleeper-data-engineer | T1.1 | B |
| T1.5 | `apps/worker`: scheduler and jobs (state, league, users, rosters, matchups current plus backfill, transactions, players daily, trending, stats, projections, nflverse); `sync_runs` logging; game-window cadence; idempotent upserts; derived-table recompute hook; CLI `pnpm sync --once [--job=name]` | sleeper-data-engineer | T1.2, T1.3, T1.4 | C |
| T1.6 | Web: `/api/health` (DB, worker heartbeat), `GET /api/sync/status`, `POST /api/sync/run` (debounced, rate-limited) | backend-engineer | T1.3 | C |
| T1.7 | Integration tests: full sync from fixtures into temp SQLite; idempotency (two runs, identical row counts and no changed rows); failure handling under MSW 500s and 429s; call-rate compliance in a simulated game-window hour; live contract suite `pnpm test:contract` (schema validation only, manual) | qa-engineer | T1.5, T1.6 | D |

**G1 phase checks:** all tables populated from fixtures; idempotency passes; limiter never exceeds configured rate in tests; worker survives API failures and logs failed `sync_runs`; contract suite passes once against the live API (run by qa-engineer, output attached to gate report).

### Phase 2: App shell, design system, league and team views (Gate G2, human review)

| ID | Task | Agent | Depends | Batch |
|---|---|---|---|---|
| T2.1 | Design system: tokens, themes, fonts; layout shell with sidebar and bottom tabs; league switcher; week selector; global search; core components (StatCard, PlayerRow, PositionBadge, InjuryBadge, MatchupGrade, TrendIndicator, Sparkline, ReasonChips, WhySheet, DataFreshness, StaleBanner, EmptyState, ErrorState, skeletons); dev-only `/dev/gallery` route showing every component in every state | frontend-engineer | G1 | A |
| T2.2 | Server data functions and DTOs: onboarding (resolve user, list leagues), league overview, standings, rosters, my team, player search | backend-engineer | G1 | A |
| T2.3 | Onboarding; Home v1 (standings snippet, roster summary, freshness); League page (standings, rosters, team detail); My Team view (roster with status, injury, bye) | frontend-engineer | T2.1, T2.2 | B |
| T2.4 | UX review of gallery and pages | ux-reviewer | T2.3 | C |
| T2.5 | E2E: onboarding, navigation on desktop and mobile, league and team pages; axe on all routes; Lighthouse | qa-engineer | T2.3 | C |
| T2.6 | Fix round for T2.4 and T2.5 findings | frontend-engineer | T2.4, T2.5 | D |

**G2 phase checks:** onboarding works end to end against fixtures and against the live API; gallery covers all states; UI checks pass. **Human checkpoint:** Steph reviews look and feel on her phone and desktop.

### Phase 3: Scoring, projections, lineup optimizer (Gate G3, human review)

| ID | Task | Agent | Depends | Batch |
|---|---|---|---|---|
| T3.1 | Scoring engine (SCORE-1, SCORE-3) and validation harness (SCORE-2) with report | analytics-engineer | G2 | A |
| T3.2 | Worker job materializing `league_player_week_points` and `defense_vs_position` after each sync (calls core) | sleeper-data-engineer | T3.1 | B |
| T3.3 | Projections and uncertainty (PROJ-1 to PROJ-4) in `packages/core/src/projections/` | analytics-engineer | T3.1 | B |
| T3.4 | Optimizer (LINEUP-1 to LINEUP-9) with reasons, in `packages/core/src/optimizer/` | analytics-engineer | T3.1 | B |
| T3.5 | Matchup adjustment (MATCH-1, 2, 4) and backtest harness (MATCH-3) with report | analytics-engineer | T3.2, T3.3 | C |
| T3.6 | Golden optimizer scenarios (at least 12, hand-verified, expected outputs documented: superflex, two flex types, bye, locked starter, locked bench player, IR, Doubtful, empty slot, unknown slot, IDP, tie in values, all-bench-better) and property tests (at least 1000 runs) | qa-engineer | T3.4 | C |
| T3.7 | Lineup data function and API (`/api/l/{id}/lineup?week&mode&roster`) with caching | backend-engineer | T3.4, T3.5 | D |
| T3.8 | Lineup page; Home "This week" lineup issues card | frontend-engineer | T3.7 | E |
| T3.9 | E2E lineup flow (mode toggle, swaps, open in Sleeper link, opponent view) | qa-engineer | T3.8 | F |

**G3 phase checks:** SCORE-2 at least 99% match on Steph's real league (report attached); golden and property tests pass; LINEUP-7 benchmark passes; backtest report exists and the alpha/beta decision is logged. **Human checkpoint:** Steph compares this week's recommended lineup and reasons to her own judgment.

### Phase 4: Waivers, players, trends, Docker beta (Gate G4, human review optional)

| ID | Task | Agent | Depends | Batch |
|---|---|---|---|---|
| T4.1 | Trends and usage metrics (TREND-1 to TREND-5) | analytics-engineer | G3 | A |
| T4.2 | Waiver engine: pool, Lineup Impact, Waiver Score, drop suggestion (WAIVER-1 to 4) | analytics-engineer | G3 | A |
| T4.3 | Production Docker image (beta): supervisor for web and worker, `/data` volume, migrations at start, healthcheck, `docker-compose.yml`, quickstart in `docs/self-hosting.md` | devops-engineer | G3 | A |
| T4.4 | Waiver priority advisor (WAIVER-6a to 6d): waiver position, competing-need flags, claim-worth-it advice, clear times | analytics-engineer | T4.2 | B |
| T4.5 | Data functions and APIs: waivers, players list (paginated, filterable), player detail | backend-engineer | T4.1, T4.2 | B |
| T4.6 | Waivers page (including waiver position, competing claims, claim advice, clear time); Players explorer and player sheet with charts; Home waiver targets and risers cards | frontend-engineer | T4.4, T4.5 | C |
| T4.7 | Tests: waiver scenarios on synthetic leagues; priority advisor golden scenarios (first in order, last in order, competing need ahead, no competition, waivers already cleared, daily waivers); perf (waivers under 2 s, players list with full pool); e2e waivers and players | qa-engineer | T4.6 | D |

**G4 phase checks:** all P0 WAIVER (1 to 4, 6a to 6d) and TREND requirements traced to tests; WAIVER-6d clear time verified against Steph's league settings; perf budgets met; beta image runs against live data for 30 minutes with healthy sync runs. **Human checkpoint (optional):** Steph deploys the beta on Unraid and uses it for this week's waivers.

### Phase 5: Matchups and league intelligence (Gate G5)

| ID | Task | Agent | Depends | Batch |
|---|---|---|---|---|
| T5.1 | Matchup Monte Carlo and swing players (SIM-1 to SIM-3) | analytics-engineer | G4 | A |
| T5.2 | All-play, luck, power score, positional heatmap, manager tendencies (LEAGUE-1 to 4, 6) | analytics-engineer | G4 | A |
| T5.3 | Playoff odds (LEAGUE-5) | analytics-engineer | T5.1 | B |
| T5.4 | Data functions and APIs for matchup and league intelligence; `computed_cache` wiring and invalidation | backend-engineer | T5.1, T5.2 | B |
| T5.5 | Matchup page; League intelligence sections; Home win probability | frontend-engineer | T5.3, T5.4 | C |
| T5.6 | Tests: seeded determinism; symmetry (P(A beats B) = 1 - P(B beats A) within Monte Carlo error); playoff odds sum to `playoff_teams` x 100% within 0.5%; perf; e2e matchup and league | qa-engineer | T5.5 | D |

**G5 phase checks:** statistical checks pass; informational Brier score of pregame win probabilities over completed weeks included in the gate report.

### Phase 6: Hardening and v1.0 release (Gate G6, human approval)

| ID | Task | Agent | Depends | Batch |
|---|---|---|---|---|
| T6.1 | Auth (HOST-8), security headers, error boundaries, structured logging, stale banner logic | backend-engineer | G5 | A |
| T6.2 | Docker final: PUID/PGID, pre-migration backups, multi-arch CI build, Unraid template, NPM notes, complete `docs/self-hosting.md` and README | devops-engineer | G5 | A |
| T6.3 | PWA manifest and icons; polish pass over accumulated Minor UX findings; preseason and offseason states | frontend-engineer | G5 | A |
| T6.4 | Full regression; fresh-install test (empty `/data`); upgrade test (previous gate tag's DB through new migrations); auth e2e; 60-minute live soak reporting calls per minute and errors | qa-engineer | T6.1 to T6.3 | B |
| T6.5 | Whole-repo security and quality review (dependency audit, headers, auth, input handling, XSS via display names) | code-reviewer | T6.1 to T6.3 | B |
| T6.6 | Final UX review of every screen | ux-reviewer | T6.3 | B |
| T6.7 | Fix round | owning agents | T6.4 to T6.6 | C |

**G6 phase checks:** every HOST requirement verified with evidence; `pnpm audit` has no high or critical issues (or each is justified); docs complete. **Human checkpoint:** release approval, then tag `v1.0.0`.

### Phase 7: P1 backlog

Suggested order: notifications (Home Assistant webhook first, then ntfy and Discord), trade analyzer and finder, Auto lineup mode, weekly backtest job, league history, weather, offline caching, "view as team". Each feature follows the same brief, verify, review cycle and ends with a mini-gate (universal checks plus UI checks).

## 10. QA gates and test strategy

### 10.1 Universal checks (every gate)

| ID | Check |
|---|---|
| U1 | `pnpm verify` passes: zero type errors, zero lint errors; lint warnings do not increase versus the previous gate |
| U2 | Unit and integration tests pass; coverage thresholds in 10.5 met |
| U3 | `pnpm build` passes; Docker image builds; container starts and `/api/health` returns 200 within 30 s |
| U4 | No `.skip`/`.only`; no new lint disables without a justification comment; no `any`; no TODO without a task ID |
| U5 | code-reviewer report on the full phase diff (`git diff main...HEAD`) has zero open Blocker or Major findings |
| U6 | Requirements trace: every requirement ID delivered this phase maps to at least one test |
| U7 | PROGRESS.md, DECISIONS.md, and docs updated; `.env.example` lists every config variable |
| U8 | All work committed; phase branch merged to `main`; tag `gate-G{n}` created |

### 10.2 UI checks (G2 onward)

| ID | Check |
|---|---|
| UI1 | E2E suite passes on all three Playwright projects |
| UI2 | axe: zero serious or critical violations on every route, light and dark |
| UI3 | Lighthouse mobile budgets (6.6) met on Home, Lineup, Waivers, Players (as they exist) |
| UI4 | ux-reviewer report has zero open Blocker or Major findings; 390px and 1280px screenshots archived to `docs/gates/G{n}/screens/` (compressed) |
| UI5 | No horizontal scroll at 390px on any route (automated: `document.documentElement.scrollWidth <= document.documentElement.clientWidth`; `innerWidth` grows with overflowing content in mobile Chromium, see DECISIONS ADR-004) |

### 10.3 Phase-specific checks

Listed under each phase in section 9.

### 10.4 Gate procedure

1. Orchestrator confirms every phase task is done in PROGRESS.md.
2. Dispatch in parallel: qa-engineer runs `pnpm gate` plus the phase-specific checks and returns metrics; code-reviewer reviews the full phase diff; ux-reviewer reviews all affected screens (if UI changed).
3. Orchestrator writes `docs/gates/G{n}.md` using the CLAUDE.md template.
4. On any failure: create fix tasks, run them through the normal cycle, re-run the failed checks, then run the full `pnpm gate` once more before declaring PASS.
5. Human gates: stop and message Steph with a five-line summary, exact instructions to try it (commands or URL), specific questions, and known issues. Wait for approval.

### 10.5 Test strategy

- **Pyramid:** many unit tests in `packages/core`, `sleeper`, `providers`; integration tests for sync and data functions against temp SQLite; focused e2e for core flows.
- **Coverage thresholds:** `packages/core` at least 90% lines and 85% branches; `sleeper` and `providers` at least 85% lines; `db` and `apps/web/lib/server` at least 75% lines. UI is covered by e2e, not line coverage.
- **Golden tests:** hand-built scenarios with documented expected outputs for the optimizer, waiver engine, and waiver priority advisor. Partial (in-progress) weeks are never used for golden expectations or SCORE-2.
- **Property tests (fast-check):** optimizer invariants (LINEUP-8); scoring linearity; simulation probabilities within [0, 1].
- **Fixtures:** recorded from Steph's real league in Phase 0 and sanitized: usernames, display names, team names, avatars, and the league name replaced with deterministic fakes. Player DB fixture trimmed to rostered players plus the top 400 by `search_rank` plus anything referenced. Synthetic fixtures for edge cases: superflex, IDP, no FAAB, divisions, preseason state, offseason state, week 18, empty transactions. Never commit unsanitized data.
- **Contract tests:** `pnpm test:contract` hits the live Sleeper API and validates schemas only. Run at every gate and weekly; never part of default CI.
- **Flakiness:** retries are 0. A flaky test is a bug: fix it or quarantine it with a task ID and a deadline.

### 10.6 Scripts contract (devops-engineer creates in T0.1; owners fill them in)

| Script | Does |
|---|---|
| `pnpm verify` | typecheck, lint, format check, unit tests |
| `pnpm test:unit` / `test:integration` / `test:e2e` / `test:a11y` / `test:coverage` | as named |
| `pnpm test:contract` | live Sleeper schema checks (manual) |
| `pnpm lhci` | Lighthouse CI against a production build |
| `pnpm screens` | screenshots of configured routes at 390/768/1280 in light and dark into `.screens/` |
| `pnpm validate:scoring` | SCORE-2 report |
| `pnpm backtest` | MATCH-3 report |
| `pnpm sync --once [--job=name]` | run sync jobs manually |
| `pnpm db:migrate` / `db:seed:fixtures` | database utilities |
| `pnpm gate` | verify, coverage, integration, build, e2e, a11y, lhci, docker build, container health smoke; writes `docs/gates/latest.json` |

## 11. Definition of done (v1.0)

- Every P0 requirement implemented, traced to tests, and passing.
- Gates G0 through G6 passed with reports in `docs/gates/`.
- Running on Steph's Unraid server behind Nginx Proxy Manager with auth enabled.
- Steph completes one full weekly cycle (Sunday lineup check and waiver night) using Sideline for the analysis.

## 12. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Undocumented projections or stats endpoints change or disappear | Provider interface; graceful degradation; contract tests at every gate. Fallbacks: nflverse weekly stats for actuals; for projections, a transparent baseline model (recency-weighted PPG x matchup multiplier) clearly labeled as such |
| Rate limiting or IP block | Shared limiter, conservative cadences, daily player DB, cache everything in SQLite |
| Scoring mismatches with Sleeper | SCORE-2 harness with a 99% gate; documented key-mapping exceptions |
| Matchup adjustment double counts what projections already include | MATCH-3 backtest gate; ship only measured improvement |
| Scope creep or quality drift across agents | File ownership, small tasks, Level 1 to 4 QA, reviewer agents, P0/P1/P2 discipline |
| Orchestrator context exhaustion | State in PROGRESS.md and DECISIONS.md, delegated exploration, `/clear` at phase boundaries |
| Season value decays as weeks pass | In-season MVP ordering; Docker beta at G4 |
| League members' data in fixtures | Sanitization policy and spot-check at G0 |
| SQLite contention between web and worker | WAL mode, `busy_timeout`, short write transactions in the worker |

## 13. Open questions for Steph

All answered on 2026-10-01 (see DECISIONS.md ADR-000 and ADR-003):

1. Username and league: provided; stored only in the gitignored `.env` (`SLEEPER_USERNAME`, `DEFAULT_LEAGUE_ID`), never in tracked files.
2. Leaguemates: Steph only for now, possibly one leaguemate later. Single shared `APP_PASSWORD`; "view as team" stays P1.
3. App name: Sideline.
4. Subdomain: `sleeper.beantech.site` (behind Nginx Proxy Manager, TLS terminated at the proxy). Unraid is x86_64: deployable images are `linux/amd64`.
5. Notifications (P1): Web Push to the installed iPhone PWA.
6. nflverse downloads enabled by default (assumed yes).
