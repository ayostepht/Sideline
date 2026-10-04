# Handoff

Single source for resuming after a session limit or `/clear`. The orchestrator updates this file and commits it after every task commit, review, and dispatch. If it disagrees with `git log`, trust `git log` and fix this file.

Last updated: 2026-10-03. **Phase 5 Batches A, B, C, D all done, reviewed, and fixed. Batch E (T5.6, qa-engineer + the G5 gate) starting next -- the last batch of the phase.** Branch `phase/5-matchups` off `main` (`30175bd`). Baseline before starting: 120 files, 1208 unit tests; current `pnpm verify`: 142 files, 1377 tests, all green.

Done: **T5.1** (`packages/core/src/sim/`: seeded RNG, Monte Carlo matchup sim, swing players) and **T5.2** (`packages/core/src/league/`: all-play, luck, power score, heatmap, manager tendencies) -- Batch A. **T5.3** (`playoff-odds.ts`, LEAGUE-5) -- Batch B. **T5.4a** (`packages/db` bulk read helpers), **T5.4b** (`matchup.ts` + API), **T5.4d** (`roster-strength.ts`, ROS optimal lineup per team), **T5.4c** (`league-intelligence.ts` + API, wires T5.2/T5.3/T5.4d together) -- Batch C. **T5.5a** (Matchup page), **T5.5b** (League intelligence sections, including a new positional-strength heatmap component), **T5.5c** (Home win-probability card) -- Batch D, all three run in parallel since file-disjoint.

Every single batch's reviews (`code-reviewer`, plus `ux-reviewer` for Batch D since it changed UI) found exactly the Blocker/Major findings you'd hope a review catches, each fixed same-session: T5.1's `actualPointsSoFar` silently defaulting, T5.3's sum-invariant breaking out of range, T5.4b's bye-week starters getting a spurious nonzero score, T5.4c's playoff-odds `reasons` dropped, T5.5a's hard-404 on preseason state and its score-range chart's near-invisible line contrast (1.07:1 measured), T5.5b's positional heatmap failing a real axe `scrollable-region-focusable` check at mobile widths (now converted to the house table-on-desktop/cards-on-mobile pattern). All Minor/nit findings are in `docs/PROGRESS.md`'s Phase 5 backlog section -- read it, there are several real but non-blocking UI polish items (pluralization, desktop density on four new League sections, a redundant triple-display of win probability, a latent sparkline.tsx overflow risk, a latent score-range dot-contrast issue). Every review report is saved under `docs/reviews/2026-10-03-p5-batch{A,B,C2,C3,D}-{code,ux}.md`.

ADR-016 (`docs/DECISIONS.md`) has the full batch/dependency reasoning, amended four times as each split was discovered (T5.4 into a/b/c/d, T5.5 into a/b/c) -- read it before writing T5.6's brief or the gate report. Decided (ADR-016 item 5): `getPlayerDetail` perf and the missing `upsertUsageWeek` wiring stay backlog, unrelated to Phase 5. **One real gap for T5.6/the gate to know about:** the canonical `pnpm test:a11y` e2e suite could not be run against the heatmap fix directly (port 3000 was held by the persistent `pnpm dev:lan` server) -- an equivalent ad hoc axe scan with identical rule config confirmed the fix, but T5.6 or the gate's own `pnpm gate` run (which stops `dev:lan` first, per the standing G4 lesson in section 2 below) should be the first real confirmation via the literal suite.

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
- **Route JS**: Lineup 178,893 B, Waivers 191,364 B, Players list 178,260 B, Players detail 193,914 B -- all over the 170,000 B soft target, all under the 204,800 B hard budget (Players detail has the least headroom, ~5.3%). Phase 5 added: Matchup 163,244 B (under the soft target), League 178,897 B (over soft, ~12.6% headroom under hard), Home unchanged (0 B delta). Worth a route-JS-budget pass before Phase 6 if more routes join the over-soft-target list.
- **Backlog:** see `docs/PROGRESS.md`'s "Backlog (open items only)" -- carried-from-Phase-4 items (above two plus several Minors), carried-from-Phase-3 items, and the standing worker/providers/tests/tooling sections. Nothing phase-4-blocking remains; everything there is either a documented design tradeoff or a legitimate follow-up for whenever its owning agent next touches that area.

## 3. In flight

- Batch E: T5.6 (qa-engineer), dispatched 2026-10-03 on branch `phase/5-matchups` -- determinism/symmetry/playoff-odds-sum tests against the real wired data functions (not just the already-unit-tested pure `packages/core` math), perf tests (cold vs. warm `computed_cache`), `e2e/matchup.spec.ts` and `e2e/league.spec.ts`, Matchup/League added to `e2e/routes.spec.ts`'s axe/no-h-scroll list, and an informational win-probability Brier score for the gate report. Agents die with the session -- if resuming mid-task, check for uncommitted files under `tests/` and `e2e/`, verify and commit, or discard and re-dispatch.

## 4. Next steps (in order)

1. When T5.6 reports back: run Level 1 verification (CLAUDE.md section 4) against its acceptance criteria, `pnpm verify`, plus the actual `pnpm test:integration`/`pnpm test:e2e`/`pnpm test:a11y` commands (qa-engineer tests aren't covered by `pnpm verify` alone).
2. Commit, update `docs/PROGRESS.md`'s Phase 5 task table, update this file. Run `code-reviewer` on the T5.6 diff (test-only, so no `ux-reviewer` needed).
3. **This is the last task before the G5 gate.** Follow CLAUDE.md section 10.4's gate procedure: confirm every Phase 5 task is done in `docs/PROGRESS.md`, dispatch `qa-engineer` to run `pnpm gate` plus the phase-specific checks (PLAN.md section 9's G5 phase checks: statistical checks pass, informational Brier score included), re-confirm `code-reviewer`/`ux-reviewer` findings from every batch are closed (they are, as of this writing -- Batches A-D all have zero open Blocker/Major findings, see `docs/reviews/2026-10-03-p5-batch*`), then write `docs/gates/G5.md` using the CLAUDE.md template. **Before any `pnpm gate` run that needs the gate's own build/e2e server: stop the host's `pnpm dev:lan` and `pnpm dev:worker` first** (frees port 3000, avoids concurrent Sleeper callers) -- this was a real, costly lesson at G4 (section 2 above), and this session already hit the port-3000-busy symptom once during Batch D's UX fix round.
4. G5 has no human checkpoint per PLAN.md's gate table (unlike G2/G3/G4/G6) -- on PASS, merge `phase/5-matchups` to `main`, tag `gate-G5`, archive the Phase 5 task table to `docs/archive/`, and tell Steph it's a clean point to `/clear` before Phase 6.

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
