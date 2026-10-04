# Handoff

Single source for resuming after a session limit or `/clear`. The orchestrator updates this file and commits it after every task commit, review, and dispatch. If it disagrees with `git log`, trust `git log` and fix this file.

Last updated: 2026-10-03. **G5 PASS, merged to `main`, tagged `gate-G5`.** No human checkpoint required for G5 (PLAN's gate table), so this closed out fully autonomously per Steph's explicit go-ahead to keep working overnight without waiting for her. `phase/5-matchups` is fully merged (commit `58d3946`); `main` is the working base for Phase 6. All Phase 5 implementation (11 sub-tasks across 5 batches after ADR-016's amendments), every batch's code/UX review fixes, and the gate's own two flaky-test fixes are in (see `docs/gates/G5.md`, all reviews zero-Blocker/Major). `pnpm verify` green on `main`: 142 files, 1377 unit tests, 0 lint warnings. Dev server (`pnpm dev:lan`) and worker (`pnpm dev:worker`) both restarted and running for Steph's continued testing.

**Phase 6 planning is starting next, autonomously, per Steph's explicit instruction this session ("continue forward, don't wait for me... create a phase 6 plan and start working on it").** One exception stands regardless of that instruction: **G6 has a human checkpoint in PLAN.md's gate table (release approval before tagging `v1.0.0`) -- stop and wait for Steph's reply there, do not tag or treat v1.0.0 as released without it.** Everything up to and including writing the G6 gate report and presenting it to her can proceed without waiting.

## 1. Resume in five steps

1. Read `CLAUDE.md`, then this file, then `docs/PROGRESS.md` and the "Rules in force" list at the top of `docs/DECISIONS.md`. For Phase 6, read PLAN.md section 9's Phase 6 table in full, plus section 10 (gates, especially G6's human-checkpoint procedure), section 7 (self-hosting/HOST requirements), and section 6.6 (PWA/Lighthouse budgets) since this is a new, final phase; open other referenced sections as needed.
2. Run `git status` and `git log --oneline -10` on branch `main` (Phase 5 merged and tagged `gate-G5`; `main` is the base for the new `phase/6-hardening` branch).
3. Check every task listed under "In flight" (section 3). Agents die with the session, so any uncommitted files in their paths are partial work. Verify and commit, or discard and re-dispatch.
4. Run `pnpm verify` (Node 24 PATH prefix, `docs/brief-rules.md`) to confirm a green baseline. Show only counts and failures.
5. Continue with "Next steps" (section 4), in order.

## 2. Where things stand

- **Phases 0 to 5 done** (G0-G5 all PASS; G2/G3/G4 human checkpoints approved, G5 had none required; tags `gate-G0` through `gate-G5`). History: `docs/archive/progress-phase{0-1,2,3,4,5}.md`; gate reports `docs/gates/G1.md` through `G5.md`.
- **Phase 5 fully merged to `main`** (`58d3946`), tag `gate-G5`. Every batch's review trail: `docs/reviews/2026-10-03-p5-batch{A,B,C2,C3,D,E}-{code,ux}.md`; the gate's own full-phase reviews: `docs/reviews/2026-10-03-G5-{code,ux}.md`.
- **Dev server and worker both running for Steph's continued hands-on testing**: `pnpm dev:lan` (log `/tmp/sideline-web-dev.log`) and `pnpm dev:worker` (log `/tmp/sideline-worker-dev.log`), `DATA_DIR` pointed at the real `./data`. Both were stopped during the G5 gate (frees port 3000 for the gate's own build/e2e/Lighthouse/Docker runs) and restarted after. **Always use `pnpm dev:lan`, never plain `pnpm --filter @sideline/web dev` or `next dev`, for any LAN/phone testing.**
- **Standing lesson, reconfirmed at G5: stop the host's `pnpm dev:lan` and `pnpm dev:worker` before any gate-affecting run, every time, no exceptions.** First found at G4; recurred as resource contention between concurrently-dispatched gate-review agents at G5 (two perf-test false-positives, confirmed non-regressions by a clean re-run after all agents finished). **New lesson from G5: don't dispatch `qa-engineer`'s full `pnpm gate` run and `ux-reviewer`'s independent `pnpm screens`/`test:a11y` run fully in parallel** -- both spin up their own dev/build servers and can contend with each other even with the host's own `dev:lan` already stopped. At G6, consider sequencing the gate run before or after the UX review, not alongside it, or confirm `pnpm gate` and `ux-reviewer`'s tooling can't collide on the same port.
- **What Phase 5 shipped:** a seeded Monte Carlo matchup win-probability simulator with score percentiles and swing players (SIM-1 to SIM-3); six league-intelligence metrics -- all-play, luck, power score, positional heatmap, playoff odds, manager tendencies (LEAGUE-1 to LEAGUE-6); the Matchup page, five new League sections, a Home win-probability card; `packages/db` bulk read helpers and ROS-optimal roster-strength computation; the full wired-path statistical test suite plus an honest informational Brier-score check (not computable from the recorded fixture, real documented reason).
- **Real, measured perf finding, confirmed unchanged through G5: `getPlayerDetail` costs ~125-127ms/call** (vs. under 1ms for every other data function). No `computed_cache` entry exists yet. Still backlog, not yet actioned -- candidate Phase 6 follow-up.
- **Known gap, not yet fixed: no worker job calls `upsertUsageWeek`.** TREND-2 and the Waiver Score's usage-trend component silently fall back to a scoring-trend proxy on real data. Logged in `docs/PROGRESS.md` backlog.
- **Real MATCH-3 decision (ADR-014, unchanged): matchup adjustment stays off** (`alpha=0, beta=0`). Matchup grades remain context-only.
- **Design:** ADR-011 is the visual identity (lime fill only, one per-page content-recommendation accent), verified clean across every Phase 5 route by the G5 UX review.
- **Local data:** `./data` (gitignored) holds a live-synced DB with the full 2025 season plus 2026 weeks. Never take screenshots from it (ADR-009 item 17) -- `pnpm screens` only runs against a fixture-seeded temp DATA_DIR.
- **Route JS**: 7 of 15 routes now over the 170,000 B soft target (up from 4 at G4), all under the 204,800 B hard budget: Lineup 178,981 B, Waivers 191,460 B, Players list 178,265 B, Players detail 194,002 B (carried from G4), plus new this phase League 178,897 B and League/teams/[rosterId] 179,534 B. Matchup itself is under soft target at 163,244 B. Worth a dedicated look in Phase 6 if any route adds more client code (PWA work, polish pass).
- **Matchup route not yet in `lighthouserc.json`'s budget list** -- add before G6 (same pattern as the G3->G4 Lineup gap, closed at G4).
- **`pnpm test:e2e`/`pnpm test:a11y` run almost entirely overlapping test sets** (350 of 354 shared) -- found at G5, doubles e2e wall-clock for limited marginal coverage. Candidate devops/qa follow-up.
- **Backlog:** see `docs/PROGRESS.md`'s "Backlog (open items only)" -- carried-from-Phase-5 items (desktop density, missing "You" markers, a few UX Minors, several code-quality Minors, the LAR/LA bye-detection gap, the sparkline.tsx latent overflow risk), carried-from-Phase-4/3/2 items, and the standing worker/providers/tests/tooling sections. Nothing phase-5-blocking remains; everything there is either a documented design tradeoff or a legitimate follow-up for whenever its owning agent next touches that area.

## 3. In flight

- Nothing. Working tree clean on `main`, all commits through `58d3946` plus tag `gate-G5`. Clean point to `/clear` once Phase 6 planning is underway and committed.

## 4. Next steps (in order)

1. **Start Phase 6 planning** (PLAN.md section 9, Phase 6 table: T6.1-T6.7 -- auth/security headers/structured logging, Docker final with PUID/PGID/pre-migration backups/multi-arch CI/Unraid template/self-hosting docs, PWA manifest and icons plus a UX polish pass and preseason/offseason states, full regression plus fresh-install plus upgrade test plus a 60-minute live soak, a whole-repo security/quality review, a final UX review of every screen, then a fix round). Read section 7 (self-hosting/HOST requirements) and section 10 (G6's phase checks and human-checkpoint procedure) in full before writing briefs. Branch `phase/6-hardening` off `main`.
2. Follow the exact same batch/verify/review/gate cycle as Phases 1-5 (CLAUDE.md sections 3-4). Expect PLAN's Phase 6 table to need the same kind of task-splitting Phases 3-5 needed (ADR-013, ADR-015, ADR-016 precedent) -- each T6.x line bundles multiple real pieces of work; split proactively using an Explore pass before writing briefs, same pattern as every prior phase.
3. **T6.4's 60-minute live soak test needs the same real-data care as G4's 30-minute one**: stop the host's `pnpm dev:worker` first (avoids two concurrent real Sleeper callers, ADR-002), reuse `pnpm gate:soak --minutes=60` (built at G4, already reusable), syncs into a dedicated anonymous Docker volume, never Steph's real `./data`. Restart `dev:worker` after.
4. **G6 is a human checkpoint (PLAN.md's gate table).** When Phase 6's batches are done and the gate's automated checks pass, write `docs/gates/G6.md`, then **stop and present it to Steph** -- a five-line summary, exact instructions to try it, specific questions, known issues -- and wait for her reply before tagging `v1.0.0` or merging `phase/6-hardening` to `main` as a release. This is explicit in CLAUDE.md section 4 and PLAN.md's gate table; Steph's "keep going, don't wait" instruction this session was about G5 and the work leading up to G6, not about skipping G6's own approval gate.

## 5. Briefs

Every Task Brief says: "Read `docs/brief-rules.md` first." Restate in the brief only the rules that matter most for that task (for example identifiers for fixture work, the migrations manifest for backend schema work).

## 6. Before every commit (orchestrator)

1. Run `pnpm verify`. If a parallel agent's files are mid-edit, run targeted checks on the task's paths instead, then the full verify before the next batch.
2. Walk the acceptance criteria against real output. Confirm `git diff --stat` stays in the agent's paths.
3. Scan the staged diff for identifiers:
   ```
   set -a && . ./.env && set +a && git diff --cached | grep -c -e "$SLEEPER_USERNAME" -e "$DEFAULT_LEAGUE_ID"
   ```
   It must print 0.
4. Run `pnpm fixtures:check` when `tests/fixtures/` changed.
5. Stage exact paths only (never `git add docs` or `git add .`).
6. Commit with the task id and the attribution line, update the PROGRESS.md task table, then update sections 2 to 4 of this file and commit it.
7. After each batch's reviews are saved and committed, suggest `/clear` to Steph: this file is enough to resume. After `/clear`, the SessionStart hook loads this file automatically; Steph types `go`.
