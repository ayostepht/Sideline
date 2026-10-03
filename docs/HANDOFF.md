# Handoff

Single source for resuming after a session limit or `/clear`. The orchestrator updates this file and commits it after every task commit, review, and dispatch. If it disagrees with `git log`, trust `git log` and fix this file.

Last updated: 2026-10-03. **G4 gate prep in progress.** All Phase 4 implementation tasks done (T4.1 to T4.8c, T4.7) plus 5 live fixes from Steph's hands-on testing. `phase/4-waivers` branched from `main` (G3 merged and tagged `gate-G3`). Batches A through G all landed, reviewed (code-reviewer every batch, ux-reviewer every UI batch), and had their findings fixed and independently re-verified -- see `docs/PROGRESS.md`'s Phase 4 task table for every commit, and `docs/reviews/2026-10-03-p4-batch{A..F}-{code,ux}.md` for the full review trail. After implementation finished, Steph tried the app live (`pnpm dev:lan` against her real synced league) and found 5 real issues, all fixed same-session -- see `docs/PROGRESS.md`'s "Phase 4 live fixes" table. Before running the actual G4 gate batch, the orchestrator did the HANDOFF-mandated live check of WAIVER-6d against Steph's real league settings and found a real bug (clear time off by 1hr in EDT) -- fixed, T4.9, commit `624771b`. Building the also-missing 30-minute Docker soak-test script now (T4.10, devops-engineer, in flight). `pnpm verify` green as of `624771b`: 120 files, 1206 unit tests (2 more than before, from T4.9's new DST tests), 0 lint warnings. Identifier leak scan clean. Next: finish T4.10, run the real 30-minute soak, then dispatch the G4 gate batch (qa-engineer/code-reviewer/ux-reviewer).

## 1. Resume in five steps

1. Read `CLAUDE.md`, then this file, then `docs/PROGRESS.md` and the "Rules in force" list at the top of `docs/DECISIONS.md`. Read PLAN.md section 9's Phase 4 table and section 10 (gates) in full before planning the first batch, since this is a new phase; open the sections it references (5.6 WAIVER, 4.3 Docker) as needed. Open full ADRs, reviews and `docs/archive/` only when a task needs them.
2. Run `git status` and `git log --oneline -10` on branch `main` (Phase 3 merged; `main` is now the working base for the new `phase/4-waivers` branch).
3. Check every task listed under "In flight" (section 3). Agents die with the session, so any uncommitted files in their paths are partial work. Verify and commit, or discard and re-dispatch.
4. Run `pnpm verify` (Node 24 PATH prefix, `docs/brief-rules.md`) to confirm a green baseline. Show only counts and failures.
5. Continue with "Next steps" (section 4), in order.

## 2. Where things stand

- **Phases 0 to 3 done** (G0, G1, G2, G3 all PASS, all human checkpoints approved; tags `gate-G0`, `gate-G1`, `gate-G2`, `gate-G3`). History: `docs/archive/progress-phase0-1.md`, `-phase2.md`, `-phase3.md`; gate reports `docs/gates/G1.md`, `G2.md`, `G3.md`.
- **Phase 4 implementation done on `phase/4-waivers` (not yet merged to `main`).** Batch order and every split decision: ADR-015 (including its two amendments, T4.5 -> a/b/c and T4.6 -> a/b/c). Every batch's review trail: `docs/reviews/2026-10-03-p4-batch{A,B,C,D,E,F}-code.md` and `-ux.md` where UI changed.
- **Dev server running for Steph's continued hands-on testing**: `pnpm dev:lan` in the background (log: `/tmp/sideline-web-dev.log`), `DATA_DIR` pointed at the real `./data`, worker already running separately (`pnpm dev:worker`, started at session start). **Always use `pnpm dev:lan`, never plain `pnpm --filter @sideline/web dev` or `next dev`, for any LAN/phone testing** -- the latter leaves `SIDELINE_DEV_ORIGINS` unset, which makes Next.js silently block HMR for a phone's LAN-IP origin and breaks client-side interactivity (this cost real debugging time this session, see the live-fixes table). If resuming and the server isn't still running, restart with `DATA_DIR` already defaulting correctly via `pnpm dev:lan` (no extra env needed) -- check `curl -s http://localhost:3000/api/health` first.
- **5 live fixes from Steph's testing, all committed** (`docs/PROGRESS.md`'s "Phase 4 live fixes" table has the full list and commits): reason chip text truncation, waiver auto-drop orphaning a required slot (her only DEF), the `dev:lan`-vs-plain-`dev` HMR issue above, unrounded `Reason.value` floats, and Lineup's redundant inline reason-chip summary (now "Why?"-only).
- **What shipped:** trends/usage metrics (T4.1); the waiver candidate pool, prefilter, Lineup Impact, Waiver Score, two sorted views, and rolling-priority advisor (T4.2a/b, T4.4) in `packages/core/src/{trends,waiver}/`; the Reason contract's `projectedPoints` field end to end -- contract (T4.8a), plain-language copy and population (T4.8b), rendering in `ReasonChips`/`WhySheet` (T4.8c) -- closing Steph's G3 "Lineup why" ask; new `packages/db` read helpers (T4.5a); the Waivers and Players data functions, APIs, and DTOs (T4.5b/c); the Waivers page, Players explorer and detail page, and Home's waiver-targets/risers cards (T4.6a/b/c); a production Docker beta image running web and worker together with PUID/PGID, pre-migration backups, and a hardened entrypoint (T4.3); and the Phase 4 test suite -- priority-advisor golden scenarios, new waiver integration coverage, perf cases, and e2e specs (T4.7).
- **Two Blockers were found and fixed this phase, both process lessons now in `docs/DECISIONS.md`'s Rules in force:** (1) a parallel-agent shared-barrel-file collision (two tasks both editing `packages/shared/src/index.ts` or `apps/web/lib/client/schemas.ts`) caused one commit to reference a file the other hadn't created yet -- fixed via `git worktree` + `cherry-pick` reordering with independent per-commit verification (Batch D), then correctly avoided the second time it came up (Batch E). Always diff a shared barrel file's actual content before staging it, not just `git status`. (2) T4.8c's new "proj pts" text pushed a Lineup reason chip wide enough to trigger a missing-`grid-cols-1` mobile layout bug, causing real horizontal scroll at 390px -- caught by the UX reviewer's own `pnpm test:a11y` run, not by eyeballing a screenshot.
- **Real, measured perf finding (T4.7): `getPlayerDetail` costs ~125ms/call at a realistic week-17/1,000-player seed** (vs. under 1ms for every other data function), because `readLeagueWeekPositionRanks`/`readUsageWeek` rescan whole-league tables per played week, per call. Home's new risers card calls it ~16 times per page load (~2.0-2.7s total), which passes the documented 4,800ms aggregate budget but is a real, worsening-with-the-season cost on the highest-traffic page. No `computed_cache` entry exists for `getPlayerDetail`/`getPlayersList` yet. Candidate G4 follow-up or early Phase 5 task for backend-engineer -- decide at gate time whether it needs fixing now or can ride as backlog.
- **Known gap, not yet fixed: no worker job calls `upsertUsageWeek`.** `packages/providers/src/usage.ts` already joins nflverse usage data to Sleeper players, but nothing persists it, so TREND-2 (usage trend) and the Waiver Score's usage-trend component silently fall back to a scoring-trend proxy on real data today. Found by T4.5b, logged in `docs/PROGRESS.md`'s "Worker and providers" backlog. Needs a sleeper-data-engineer task wiring the existing `provider.getUsage(...)` into `upsertUsageWeek` inside `nflverseJob` (or a sibling job).
- **Real MATCH-3 decision (ADR-014 resolution): matchup adjustment stays off** (`alpha=0, beta=0`), confirmed by a live backtest. Matchup grades remain context-only.
- **Design:** ADR-011 is the visual identity (lime fill only, one per-page content-recommendation accent -- Phase 4 respected this throughout, verified by every ux-reviewer pass).
- **Local data:** `./data` (gitignored) holds a live-synced DB with the full 2025 season plus 2026 weeks. Never take screenshots from it (ADR-009 item 17) -- `pnpm screens` only runs against a fixture-seeded temp DATA_DIR, as used throughout this phase's ux-reviewer passes.
- **Route JS**: Lineup 178,874 B, Waivers 191,328 B, Players list 178,346 B, Players detail 193,981 B -- all over the 170,000 B soft target, all under the 204,800 B hard budget. Worth revisiting the soft target's realism for feature-dense routes at the gate rather than stripping functionality (T4.6a's own suggestion, logged in `docs/PROGRESS.md`).
- **Backlog carried into Phase 4 from Phase 3** (now mostly addressed): Lineup "why" -- done (see above). `lighthouserc.json` missing Lineup/Waivers/Players -- done (T4.7). Lineup route JS over soft target -- still true, see above, not blocking.

## 3. In flight

- **T4.10 (devops-engineer, background agent): Docker beta soak-test script (`pnpm gate:soak [--minutes=N]`).** Dispatched to close the G4 phase check "beta image runs against live data for 30 minutes with healthy sync runs" -- no such script existed anywhere in the repo before this. Not yet landed as of this writing; if resuming mid-session, check whether its agent reported back (files would be `scripts/gate/soak.ts`, new; `package.json`, one new script entry) -- verify and commit per the normal cycle before continuing, or re-dispatch if it never finished.

## 4. Next steps (in order)

1. Once T4.10 lands and is verified/committed, run the real soak test for gate evidence: `pnpm gate:soak --minutes=30` (not just the agent's own 1-minute smoke test).
2. **Run the G4 gate** (PLAN 10.4, CLAUDE.md section 4 Level 3): dispatch in parallel -- qa-engineer runs `pnpm gate` plus PLAN 9's G4 phase checks (all P0 WAIVER and TREND requirements traced to tests; perf budgets met); code-reviewer reviews the full phase diff (`main..phase/4-waivers`) as a whole, not just per-batch, including the 5 live-fix commits and T4.9/T4.10; ux-reviewer does a final pass over every Phase 4 screen (the live fixes changed Lineup/Waivers visuals again since the last per-batch ux review, worth a fresh look). WAIVER-6d's live check against Steph's real league settings is already done (T4.9, commit `624771b`) -- don't repeat it, but do confirm the fix's new unit tests are included in whatever qa-engineer reports.
3. On any gate failure: create fix tasks, run them through the normal cycle, re-run the failed checks, then run the full `pnpm gate` once more before declaring PASS.
4. Write `docs/gates/G4.md` using the CLAUDE.md template (section 7).
5. G4's human checkpoint is optional (PLAN's phase table) -- message Steph with the five-line summary either way, but don't block starting Phase 5 planning on her reply unless she asks to review first.
6. Decide (with Steph if needed) whether the `getPlayerDetail` perf cost and the missing `upsertUsageWeek` wiring (both logged in section 2 above) get fixed before or after the gate -- neither currently fails a hard budget or breaks a shipped feature, both are real.
7. Merge `phase/4-waivers` to `main`, tag `gate-G4`, archive the Phase 4 task table to `docs/archive/`, suggest `/clear` to Steph.

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
