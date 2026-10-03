# Handoff

Single source for resuming after a session limit or `/clear`. The orchestrator updates this file and commits it after every task commit, review, and dispatch. If it disagrees with `git log`, trust `git log` and fix this file.

Last updated: 2026-10-03. **Phase 3 done, G3 PASS, Steph approved.** `phase/3-scoring` merged to `main`, tagged `gate-G3`. Steph's G3 feedback: lineup recommendation and look/feel approved; wants more detail in the "why" (projected stats plus plainer language), explicitly deferred to a future phase (logged in `docs/PROGRESS.md`'s "Later phases"); three Minor UX findings deferred; merge approved. Clean point to `/clear`. Next: plan Phase 4 batches (PLAN.md section 9: waivers, players, trends, Docker beta; gate G4 is a human checkpoint but optional).

## 1. Resume in five steps

1. Read `CLAUDE.md`, then this file, then `docs/PROGRESS.md` and the "Rules in force" list at the top of `docs/DECISIONS.md`. Read PLAN.md section 9's Phase 4 table and section 10 (gates) in full before planning the first batch, since this is a new phase; open the sections it references (5.6 WAIVER, 4.3 Docker) as needed. Open full ADRs, reviews and `docs/archive/` only when a task needs them.
2. Run `git status` and `git log --oneline -10` on branch `main` (Phase 3 merged; `main` is now the working base for the new `phase/4-waivers` branch).
3. Check every task listed under "In flight" (section 3). Agents die with the session, so any uncommitted files in their paths are partial work. Verify and commit, or discard and re-dispatch.
4. Run `pnpm verify` (Node 24 PATH prefix, `docs/brief-rules.md`) to confirm a green baseline. Show only counts and failures.
5. Continue with "Next steps" (section 4), in order.

## 2. Where things stand

- **Phases 0 to 3 done** (G0, G1, G2, G3 all PASS, all human checkpoints approved; tags `gate-G0`, `gate-G1`, `gate-G2`, `gate-G3`). History: `docs/archive/progress-phase0-1.md`, `-phase2.md`, `-phase3.md`; gate reports `docs/gates/G1.md`, `G2.md`, `G3.md`.
- **Baseline on `main` at the G3 merge:** `pnpm verify` 97 files, 963 unit tests, 0 lint warnings. 11/11 full `pnpm gate` (see `docs/gates/G3.md` for the metrics table: coverage, Lighthouse, route JS, Docker image sizes).
- **G3 found and fixed two real sync-job data-completeness bugs** (not yet obvious from reading the code alone, worth knowing before Phase 4 touches the worker again): `statsJob` only ever refetched the last two weeks instead of backfilling every missed week (fixed, mirrors `matchupsJob`'s existing pattern, commit `51a1a31`); `backfill_2025` never synced the 2025 nflverse schedule, so the MATCH-3 backtest had no resolvable opponent for any 2025 player-week (fixed, commit `5fda4f6`). Both are now self-healing; see ADR-013 item 24 for the full writeup.
- **Real MATCH-3 decision (ADR-014 resolution): matchup adjustment stays off** (`alpha=0, beta=0`), confirmed by a live backtest against the full 2025 season plus 2026 weeks (5323 player-weeks, 0.14% MAE improvement, below the 1% ship bar). Matchup grades remain context-only. Phase 4/5 work should not assume a non-zero multiplier is coming soon.
- **Design:** ADR-011 (with its purple amendment) is the visual identity: #FFFFFF, #2A2A2A, #D9D9D9, lime #D5FC51 (fill only on light grounds), blue #2147E8/#8FA8FF, neon purple #DF00FE (non-text or large text; black text on it), Inter, corners at most 4px, dense, scoreboard feel. Phase 4 UI must follow it.
- **Local data:** `./data` (gitignored) holds a live-synced DB, now with the full 2025 season plus 2026 weeks 1-4. Never take screenshots from it (ADR-009 item 17). `pnpm dev:worker` was running at session end; restart it if it's not running when you resume.
- **Backlog carried into Phase 4** (full detail in `docs/PROGRESS.md`'s "Carried from Phase 3"): Lineup "why" needs more detail (Steph's explicit ask, candidate for a Phase 4 task or a dedicated polish task); `lighthouserc.json` missing the Lineup route; Lineup route JS over its soft target; a few low-priority code-review minors.

## 3. In flight

- Nothing. Clean point to `/clear`.

## 4. Next steps (in order)

1. **Plan Phase 4 batches.** Read PLAN.md section 9's Phase 4 table (T4.1 trends, T4.2 waiver engine, T4.3 Docker beta, T4.4 waiver priority advisor, T4.5 data functions/APIs, T4.6 Waivers/Players pages, T4.7 tests) and section 10's G4 phase checks. Split per CLAUDE.md's ~400-line target and ownership rules (log any split in `docs/DECISIONS.md`, same pattern as ADR-013 for Phase 3). Create `phase/4-waivers` from `main`.
2. Decide whether to fold in the carried-forward "Lineup why" enhancement (Steph's G3 ask) as an early Phase 4 task or a standalone polish task before Phase 4 proper starts — Steph said either is fine.
3. Dispatch Batch A (tasks with no Phase 4 intra-phase dependency, disjoint files, max 3 parallel).
4. Watch the backlog items above (Lighthouse coverage, Lineup route JS) when Phase 4 adds more routes and client code.

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
