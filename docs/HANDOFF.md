# Handoff

Single source for resuming after a session limit or `/clear`. The orchestrator updates this file and commits it after every task commit, review, and dispatch. If it disagrees with `git log`, trust `git log` and fix this file.

Last updated: 2026-10-07. **v1.2.1 released**: daily `player_ids` job fills missing `players.espn_id` from DynastyProcess's crosswalk (ADR-021; Sleeper had ESPN ids for only 46 of 155 rostered players), players-guard bypass when no ESPN ids are stored (6h cooldown), and the player card's Next opponents section (next 4 weeks, DvP grades, context only per ADR-014). v1.2.0 earlier today: news sync fix, usage_week persisted, RotoWire notes lead the news. Remote: `origin` is https://github.com/ayostepht/Sideline (public).

**Phase 7b (selective) is planned, not started** (ADR-022, branch `phase/7b-selective`): Auto lineup (default mode), trade analyzer and finder (own nav item), weather (Open-Meteo, context only). Steph approved the scope and answered every product question on 2026-10-07. Notifications are skipped; "view as team" is dropped; multi-user support is the next roadmap item after 7b. v1.2.1 is deployed on Steph's Unraid.

## 1. Resume in five steps

1. Read `CLAUDE.md`, then this file, then `docs/PROGRESS.md` and the "Rules in force" list at the top of `docs/DECISIONS.md`. If starting Phase 7, read PLAN.md section 9's Phase 7 line (currently just a suggested feature order, not a task table -- planning it from scratch is the first real step) plus whatever sections the chosen features cite.
2. Run `git status` and `git log --oneline -10` on branch `main` (v1.0.0 tagged at `fd56f10`).
3. Check every task listed under "In flight" (section 3). Agents die with the session, so any uncommitted files in their paths are partial work. Verify and commit, or discard and re-dispatch.
4. Run `pnpm verify` (Node 24 PATH prefix, `docs/brief-rules.md`) to confirm a green baseline. Show only counts and failures.
5. Continue with "Next steps" (section 4), in order.

## 2. Where things stand

- **Phases 0 to 6 done, v1.0.0 released** (G0-G6 all PASS; G2/G3/G4/G6 human checkpoints approved, G5 had none required; tags `gate-G0` through `gate-G6`, plus `v1.0.0`). History: `docs/archive/progress-phase{0-1,2,3,4,5,6}.md`; gate reports `docs/gates/G1.md` through `G6.md`.
- **Dev server and worker both running again** for Steph's continued hands-on testing (she asked for them back after trying the v1.0.0 build): `pnpm dev:lan` (log `/tmp/sideline-web-dev.log`) and `pnpm dev:worker` (log `/tmp/sideline-worker-dev.log`), `DATA_DIR` pointed at the real `./data`. **Always use `pnpm dev:lan`, never plain `pnpm --filter @sideline/web dev` or `next dev`, for any LAN/phone testing.**
- **What Phase 6 shipped:** optional `APP_PASSWORD` login (HOST-8) with security headers and structured logging; a real Docker/Unraid self-hosting path (PUID/PGID fix, Unraid template, full `docs/self-hosting.md`, GHCR wired into CI); a PWA manifest/icon set; consolidated preseason/offseason states and League desktop-table polish. A post-release fix round (Batch E, `docs/archive/progress-phase6.md`) fixed a real optimizer bug Steph found live-testing: the lineup solver could recommend a zero-benefit swap chain when multiple players tied in value across interchangeable slots -- fixed at the root (a stability tiebreak) and defensively (a UI materiality floor), plus a generalizing property test.
- **Standing lesson from the gate-rerun chase during Batch E: a `pnpm gate` run dispatched through a subagent can silently stall in the subagent's own completion-watcher even though the gate script itself finishes fine** (happened once -- the gate completed in ~9 minutes but the subagent didn't report back for about an hour). If a dispatched gate run goes quiet, check `docs/gates/latest.json`'s `finishedAt` and `.gate/logs/*.log` timestamps directly rather than waiting indefinitely, or just run `pnpm gate` directly via a background Bash command (gets a native harness notification, no extra indirection).
- **Standing lesson, reconfirmed at G5/G6: stop the host's `pnpm dev:lan` and `pnpm dev:worker` before any gate-affecting run, every time, no exceptions** (frees port 3000; avoids resource-contention false-positive perf-test failures, seen at G4, G5, and twice during Batch E).
- **Known gap, not yet fixed: no worker job calls `upsertUsageWeek`.** TREND-2 and the Waiver Score's usage-trend component silently fall back to a scoring-trend proxy on real data. Logged in `docs/PROGRESS.md` backlog.
- **Real MATCH-3 decision (ADR-014, unchanged): matchup adjustment stays off** (`alpha=0, beta=0`). Matchup grades remain context-only.
- **Design:** ADR-011 is the visual identity (lime fill only, one per-page content-recommendation accent), verified clean across every route through the G6 UX review.
- **Local data:** `./data` (gitignored) holds a live-synced DB with the full 2025 season plus 2026 weeks. Never take screenshots from it (ADR-009 item 17) -- `pnpm screens` only runs against a fixture-seeded temp DATA_DIR.
- **Registry:** CI publishes `ghcr.io/ayostepht/sideline` on pushes to `main` (`latest`, `sha-*`) and version tags (`v*.*.*`). `unraid/sideline.xml` points at it [OPS-1]. The GHCR package must be Public for Unraid to pull without credentials.
- **Backlog:** see `docs/PROGRESS.md`'s "Backlog (open items only)" -- carried-from-Phase-6 items (CSP `'unsafe-inline'` accepted risk, a timing side-channel in `constantTimeStringEqual`, League table row-height variance, login card centering, missing offseason/complete-league e2e coverage, `proxy.ts`'s missing `?from=` redirect param, Waivers' repetitive "Suggested drop" text), carried-from-Phase-5/4/3/2 items, and the standing worker/providers/tests/tooling sections. Nothing there is release-blocking; everything is either a documented design tradeoff or a legitimate follow-up for whenever its owning agent next touches that area.

## 3. In flight

- **P7b.1 done** (`7f5ac4c`, verify 1656 passed; the orchestrator's integration fix passes `resolvedMode` in `lineup/page.tsx`). Its code review is folded into Batch 2's review.
- **Batch 2 done**: P7b.2 `6be1eda` (db), P7b.3 `a3ea5e5` (core trade, finder 181 ms), P7b.4 `cffc00f` (providers Open-Meteo). `pnpm verify` 1712 passed. The `weather` job name is still parked for P7b.6: `sync.ts` adds `"weather"` after `player_news` plus `weather: 3 * HOUR_MS`; `contracts.test.ts:306` job count 14 to 15; `recompute.ts` `JOB_TABLES` adds `weather: ["game_weather"]`.
- Batch 1-2 review: APPROVE, no Blocker/Major (`docs/reviews/2026-10-07-p7b-batch12-code.md`). m1 goes to P7b.9, m2 to P7b.6, m3 to P7b.8, m4 and m5 to the backlog.
- **Batch 3 done**: P7b.6 `3b6118c` (worker weather job, job name now committed), P7b.5 `24a8b72` (Auto, default `auto`), P7b.7 `830f9d6` (trade server and GET routes: finder 228 ms, evaluate 37 ms). `pnpm verify` 1750 passed.
- Batch 3 review: CHANGES REQUIRED, 2 Majors (`docs/reviews/2026-10-07-p7b-batch3-code.md`).
- **Batch 4a done**: P7b.6f `58c64ac`, P7b.7f `b67cca6` (`lineup.ts` re-exports the moved readers because the QA test `tests/integration/sim-league-wired` imports them), P7b.8 `0ef710b`. Verify 1759 passed; build OK.
- **Batch 4b dispatched** (2026-10-07): P7b.9 (backend weather fields in lineup, next-opponents and matchup; m1, m5), P7b.10 (frontend Trades route and nav). After they land: code review of Batch 4 (`0ef710b^..HEAD` plus the 4b commits) and a UX review of Lineup and Trades. Then the Auto mini-gate, then Batch 5 (P7b.11 weather chips, P7b.12 QA).
- Before that, Planning committed on `phase/7b-selective` (ADR-022, PLAN.md 5.4 AUTO-1, 5.9 TRADE-3..5, new 5.10 WX-1..5, section 8 multi-user, PROGRESS.md "Phase 7b task table"). Baseline `pnpm verify` on 2026-10-07: 1638 passed.

## 4. Next steps (in order)

1. **Verify and commit Batch 4b**, then the Batch 4 code review and UX review. Batch 3 was P7b.5 (backend, Auto in `getLineup`, flip the request default to `auto`), P7b.6 (sleeper-data, worker `weather` job; pre-apply the parked job-name patch), P7b.7 (backend, trade server and API). P7b.5 and P7b.7 are both backend-engineer with disjoint files (`lineup.ts` and `(main)/page.tsx`'s server read vs new `trades.ts`, `roster-strength.ts` export and `app/api/.../trades`). Write the brief from PROGRESS.md's task table, ADR-022 and PLAN.md AUTO-1, TRADE-1..5, WX-1..5. Exploration facts to pass along: `LineupModeSchema` is in `packages/shared/src/api/lineup.ts:6-7`, and `LineupResponseSchema` is strict; `ReasonSchema` is in `packages/shared/src/reason.ts`; sync job names and cadences are in `packages/shared/src/sync.ts`.
2. Then Batches 2 to 5 per the task table, with code review after every batch, UX review after batches 4 and 5, and mini-gates (Auto after batch 4; Trades and weather after batch 5). Release v1.3.0.
3. Exploration facts for later briefs: `getMatchup` (`apps/web/lib/server/matchup.ts`) sims the current Sleeper starters at the median, cached `matchup-sim:${rosterId}`, about 10 ms; the Lineup page doesn't call it today, but Home does. Roster strength `rosValueFor` and `rosValueByPlayer` (`apps/web/lib/server/roster-strength.ts:166,248`) are internal and need exporting for trades. `simulatePlayoffOdds` (`packages/core/src/league/playoff-odds.ts:131`) inputs are built in `league-intelligence.ts:255-299`. The heatmap is keyed by slot type (FLEX included). The `schedule` table has `roof` but no stadium/coords, and nflverse games.csv has `stadium_id`. Worker job template: `apps/worker/src/jobs/player-ids-job.ts`. The next migration is 0005.
4. `pnpm dev:lan` and `pnpm dev:worker` may be running for Steph's testing; stop them before any gate-affecting run.

## 5. Briefs

Every Task Brief says: "Read `docs/brief-rules.md` first." Restate in the brief only the rules that matter most for that task (for example identifiers for fixture work, the migrations manifest for backend schema work).

## 6. Before every commit (orchestrator)

1. Run `pnpm verify`. If a parallel agent's files are mid-edit, run targeted checks on the task's paths instead, then the full verify before the next batch.
2. Walk the acceptance criteria against real output. Confirm `git diff --stat` stays in the agent's paths.
3. Scan the staged diff for identifiers:
   ```
   set -a && . ./.env && set +a && git diff --cached | sed -E "s#(github\.com|raw\.githubusercontent\.com|ghcr\.io)/$SLEEPER_USERNAME##gI" | grep -c -i -e "$SLEEPER_USERNAME" -e "$DEFAULT_LEAGUE_ID"
   ```
   It must print 0. The sed strips the repo and image URLs that ADR-018 allows.
4. Run `pnpm fixtures:check` when `tests/fixtures/` changed.
5. Stage exact paths only (never `git add docs` or `git add .`).
6. Commit with the task id and the attribution line, update the PROGRESS.md task table, then update sections 2 to 4 of this file and commit it.
7. After each batch's reviews are saved and committed, suggest `/clear` to Steph: this file is enough to resume. After `/clear`, the SessionStart hook loads this file automatically; Steph types `go`.
