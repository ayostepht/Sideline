# Handoff

Single source for resuming after a session limit or `/clear`. The orchestrator updates this file and commits it after every task commit, review, and dispatch. If it disagrees with `git log`, trust `git log` and fix this file.

Last updated: 2026-10-04. **G5 PASS, merged and tagged (see history below). Phase 6 ("Hardening and v1.0 release") is underway on `phase/6-hardening`, Batches A and B done, Batch C (the gate-prep batch) starting next.** Everything is proceeding autonomously per Steph's explicit go-ahead to keep working overnight without waiting for her. **The one standing exception: G6 has a human checkpoint in PLAN.md's gate table (release approval before tagging `v1.0.0`) -- stop and wait for Steph's reply there, do not tag or treat v1.0.0 as released without it.** Everything up to and including writing the G6 gate report and presenting it to her can proceed without waiting.

**Phase 6 Batches A and B done** (ADR-017's plan: `docs/DECISIONS.md`):
- **Batch A: T6.1** (auth HOST-8, security headers, structured logging -- `apps/web/proxy.ts`, Next 16's renamed `middleware.ts`), **T6.2** (Docker/self-hosting: PUID/PGID default fix, Unraid template, `docs/self-hosting.md` rewrite), **T6.3a** (PWA manifest/icons, theme-color fix). One Major fixed: the login rate limiter's IP-based trust model wasn't enforced or warned about and had unbounded memory growth if violated -- fixed with a bounded/swept rate-limiter map plus a prominent self-hosting docs warning.
- **Batch B: T6.1c** (login page, Settings logout control), **T6.3b** (preseason/offseason states, consolidated across 7 pages, keyed on the authoritative `LeagueOverview.status` instead of ad hoc week checks), **T6.3c** (League desktop tables, "You" markers, pluralization). Two Blockers fixed: a real axe color-contrast violation on Playoff Odds' seed-chances link against the new "mine" row tint (4.18:1, needed 4.5:1); the branch's own `pnpm test:a11y` suite was genuinely red (7/350) from two stale e2e assertions not updated for this batch's own UI changes (fixed, not weakened -- full suite now 363/363).
- Full review trail: `docs/reviews/2026-10-04-p6-batch{A,B}-{code,ux}.md`. `pnpm verify` on `phase/6-hardening`: 149 files, 1457 tests, all green.

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

- Nothing yet. Batch C is about to be dispatched: **T6.4** (qa-engineer) and **T6.5** (code-reviewer) in parallel first (T6.5 needs no server, won't contend with T6.4), **T6.6** (ux-reviewer) dispatched separately afterward per the G5 port-contention lesson below. Agents die with the session -- if resuming mid-batch, check for uncommitted files under `tests/`, `e2e/`, `docs/reviews/`, `docs/gates/`, verify and commit, or discard and re-dispatch. The 60-minute soak specifically: check whether a soak container is still running (`docker ps`) before assuming it died with the session.

## 4. Next steps (in order)

1. Before dispatching T6.4: stop the host's `pnpm dev:worker` (avoids two concurrent real Sleeper callers during the soak, ADR-002) and `pnpm dev:lan` (frees the port for T6.4's own regression/e2e server). Restart both after T6.4 reports back.
2. Dispatch **T6.4** (qa-engineer: full regression, fresh-install test with an empty `/data`, upgrade test from `gate-G5`'s DB through the current migrations, auth e2e covering the new login/logout flow, 60-minute live soak reusing `pnpm gate:soak --minutes=60` built at G4 -- syncs into a dedicated anonymous Docker volume, never Steph's real `./data`) and **T6.5** (code-reviewer: whole-repo security and quality review -- dependency audit, headers, auth, input handling, XSS via display names; Batch A/B's reviews already caught and fixed the main auth-related issues, so this should mostly confirm rather than discover, but give it real scrutiny since it's the last full-repo security pass before v1.0) in parallel. T6.5 needs no dev server and won't contend with T6.4.
3. **Learned at the G5 gate, reconfirmed in Batch B's reviews: don't dispatch a qa-engineer server-heavy run and a ux-reviewer `pnpm screens`/`test:a11y` run fully in parallel** -- both can spin up dev/build servers and contend with each other. Dispatch **T6.6** (ux-reviewer: final review of every screen) only after T6.4 reports back and its server work is done.
4. Restart `pnpm dev:lan`/`pnpm dev:worker` once T6.4 and T6.6's server-dependent work is finished, for Steph's continued testing.
5. Batch D: T6.7 fix round (owning agents, based on T6.4/T6.5/T6.6 findings).
7. **G6 is a human checkpoint (PLAN.md's gate table).** When Phase 6's batches are done and the gate's automated checks pass, write `docs/gates/G6.md`, then **stop and present it to Steph** -- a five-line summary, exact instructions to try it, specific questions, known issues -- and wait for her reply before tagging `v1.0.0` or merging `phase/6-hardening` to `main` as a release. This is explicit in CLAUDE.md section 4 and PLAN.md's gate table; Steph's "keep going, don't wait" instruction this session was about G5 and the work leading up to G6, not about skipping G6's own approval gate.

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
