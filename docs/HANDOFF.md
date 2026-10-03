# Handoff

Single source for resuming after a session limit or `/clear`. The orchestrator updates this file and commits it after every task commit, review, and dispatch. If it disagrees with `git log`, trust `git log` and fix this file.

Last updated: 2026-10-03. **Phase 5 planning done (ADR-016), Batch A dispatched.** Branch `phase/5-matchups` created off `main` (`30175bd`). `pnpm verify` baseline confirmed green before starting: 120 files, 1208 unit tests, 0 lint warnings. Phase 5 task table (T5.1-T5.6, batches A-E) is in `docs/PROGRESS.md`; the batch/dependency shape differs from PLAN.md's literal table (T5.3 gets its own Batch B, T5.4 moves to Batch C and depends on T5.3 too) per ADR-016 -- read it before touching T5.3 or T5.4. Decided (ADR-016 item 5): `getPlayerDetail` perf and the missing `upsertUsageWeek` wiring stay backlog, not a dedicated Phase 5 task -- neither blocks any Phase 5 requirement. **In flight now:** Batch A, two analytics-engineer subagents dispatched in parallel -- T5.1 (SIM-1 to 3, Monte Carlo matchup win probability and swing players, new `packages/core/src/sim/`, owns the new seeded-RNG utility) and T5.2 (LEAGUE-1,2,3,4,6: all-play, luck, power score, heatmap, manager tendencies, new `packages/core/src/league/`). Next after both land: Level 1 verify each, code-reviewer on the Batch A diff, commit, then Batch B (T5.3 playoff odds, reusing T5.1's RNG).

## 1. Resume in five steps

1. Read `CLAUDE.md`, then this file, then `docs/PROGRESS.md` and the "Rules in force" list at the top of `docs/DECISIONS.md`. For Phase 5, read PLAN.md section 9's Phase 5 table in full, plus section 10 (gates) and section 5.7/5.8 (SIM, LEAGUE specs) since this is a new phase; open other referenced sections as needed.
2. Run `git status` and `git log --oneline -10` on branch `main` (Phase 4 merged and tagged `gate-G4`; `main` is the base for the new `phase/5-matchups` branch).
3. Check every task listed under "In flight" (section 3). Agents die with the session, so any uncommitted files in their paths are partial work. Verify and commit, or discard and re-dispatch.
4. Run `pnpm verify` (Node 24 PATH prefix, `docs/brief-rules.md`) to confirm a green baseline. Show only counts and failures.
5. Continue with "Next steps" (section 4), in order.

## 2. Where things stand

- **Phases 0 to 4 done** (G0-G4 all PASS; G2/G3 human checkpoints approved, G4's optional checkpoint reply pending but not blocking; tags `gate-G0` through `gate-G4`). History: `docs/archive/progress-phase{0-1,2,3,4}.md`; gate reports `docs/gates/G1.md` through `G4.md`.
- **Phase 4 fully merged to `main`** (`6a1cd26`), tag `gate-G4`. Every batch's review trail: `docs/reviews/2026-10-03-p4-batch{A-F}-{code,ux}.md`; the gate's own full-phase reviews: `docs/reviews/2026-10-03-G4-{code,ux}.md`.
- **Dev server and worker both running for Steph's continued hands-on testing**: `pnpm dev:lan` (log `/tmp/sideline-web-dev.log`) and `pnpm dev:worker` (log `/tmp/sideline-worker-dev.log`), `DATA_DIR` pointed at the real `./data`. Both were paused during the G4 gate (to free port 3000 for the gate's own build/e2e/Lighthouse server, and to avoid two concurrent real Sleeper callers while the 30-minute Docker soak test ran its own worker against a separate volume) and restarted after. **Always use `pnpm dev:lan`, never plain `pnpm --filter @sideline/web dev` or `next dev`, for any LAN/phone testing** -- the latter leaves `SIDELINE_DEV_ORIGINS` unset and silently blocks HMR for a phone's LAN-IP origin (cost real debugging time in Phase 4).
- **Lesson for any future gate run that needs a live Docker soak and/or the gate's own build server: stop the host's `pnpm dev:lan` (frees port 3000) and `pnpm dev:worker` (avoids two concurrent real Sleeper callers, ADR-002) first, then restart both after.** Found the hard way at G4: the first `pnpm gate:soak` attempt and the first `pnpm gate` run were both launched without doing this, causing a real resource-contention false-positive (axe/mobile-pixel failures that vanished on a clean re-run) and an avoidable rules violation (two workers hitting Sleeper at once). Worth adding to `docs/brief-rules.md` or the gate script itself if this recurs at G5/G6.
- **What Phase 4 shipped:** trends/usage metrics (T4.1); the waiver candidate pool, prefilter, Lineup Impact, Waiver Score, two sorted views, and rolling-priority advisor (T4.2a/b, T4.4); the Reason contract's `projectedPoints` field end to end (T4.8a/b/c, closing Steph's G3 "Lineup why" ask); the Waivers and Players data functions, APIs, pages, and Home's waiver-targets/risers cards (T4.5/T4.6); a production Docker beta image (T4.3); the Phase 4 test suite (T4.7); plus 5 Steph-reported live fixes and the G4 gate's own T4.9 (WAIVER-6d DST bug) and T4.10 (`pnpm gate:soak`, reusable for Phase 6's 60-minute soak).
- **Real, measured perf finding, confirmed stable through G4: `getPlayerDetail` costs ~125-127ms/call** (vs. under 1ms for every other data function). Home's risers card calls it ~16 times/load (~2.0-2.7s, under the 4,800ms budget but a real, worsening cost). No `computed_cache` entry exists yet. Candidate early-Phase-5 or backend-engineer follow-up; logged in `docs/PROGRESS.md` backlog, not yet actioned.
- **Known gap, not yet fixed: no worker job calls `upsertUsageWeek`.** TREND-2 and the Waiver Score's usage-trend component silently fall back to a scoring-trend proxy on real data. Needs a sleeper-data-engineer task wiring `packages/providers`' existing `joinUsage` into the worker's `nflverseJob`. Logged in `docs/PROGRESS.md` backlog.
- **Real MATCH-3 decision (ADR-014, unchanged): matchup adjustment stays off** (`alpha=0, beta=0`). Matchup grades remain context-only. Phase 5's SIM/LEAGUE work (section 5.7/5.8) doesn't depend on this changing.
- **Design:** ADR-011 is the visual identity (lime fill only, one per-page content-recommendation accent), verified clean across every Phase 4 route by the G4 UX review.
- **Local data:** `./data` (gitignored) holds a live-synced DB with the full 2025 season plus 2026 weeks. Never take screenshots from it (ADR-009 item 17) -- `pnpm screens` only runs against a fixture-seeded temp DATA_DIR.
- **Route JS**: Lineup 178,893 B, Waivers 191,364 B, Players list 178,260 B, Players detail 193,914 B -- all over the 170,000 B soft target, all under the 204,800 B hard budget (Players detail has the least headroom, ~5.3%). Worth revisiting before Phase 5 adds more client code to any of these.
- **Backlog:** see `docs/PROGRESS.md`'s "Backlog (open items only)" -- carried-from-Phase-4 items (above two plus several Minors), carried-from-Phase-3 items, and the standing worker/providers/tests/tooling sections. Nothing phase-4-blocking remains; everything there is either a documented design tradeoff or a legitimate follow-up for whenever its owning agent next touches that area.

## 3. In flight

- Batch A: T5.1 (analytics-engineer, `packages/core/src/sim/`) and T5.2 (analytics-engineer, `packages/core/src/league/`), dispatched in parallel 2026-10-03 on branch `phase/5-matchups`. Agents die with the session -- if resuming mid-batch, check for uncommitted files in those two directories, verify and commit, or discard and re-dispatch.

## 4. Next steps (in order)

1. When both T5.1 and T5.2 report back: run Level 1 verification on each (CLAUDE.md section 4) against their acceptance criteria, `pnpm verify`, `git diff --stat` scoped to their owned paths.
2. Run `code-reviewer` on the Batch A diff (`git diff main...HEAD`). Fix any Blocker/Major findings before Batch B.
3. Commit (one commit per task, conventional format with the task id), update `docs/PROGRESS.md`'s Phase 5 task table, update this file.
4. Dispatch Batch B (T5.3, playoff odds, analytics-engineer, depends on T5.1 -- reuse its RNG/sampler, don't rebuild one). Then continue Batches C-E per `docs/PROGRESS.md`'s Phase 5 task table and ADR-016.

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
