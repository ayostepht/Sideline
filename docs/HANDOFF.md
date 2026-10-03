# Handoff

Single source for resuming after a session limit or `/clear`. The orchestrator updates this file and commits it after every task commit, review, and dispatch. If it disagrees with `git log`, trust `git log` and fix this file.

Last updated: 2026-10-03. Phase 3 Batch H (T3.8a, T3.8b: Lineup page, Home card, design backlog) landed, committed, Level 2 reviewed (code + UX), and all Major findings fixed and committed (`765a18d`, `066fc44`). `pnpm verify`: 97 files, 954 tests, 0 lint warnings. Clean point to `/clear`. Next: dispatch Batch I (T3.9).

## 1. Resume in five steps

1. Read `CLAUDE.md`, then this file, then `docs/PROGRESS.md` and the "Rules in force" list at the top of `docs/DECISIONS.md`. Read PLAN.md only by section: section 9 for the current phase, section 10 for gates, and whatever sections the next task cites. Open full ADRs, reviews and `docs/archive/` only when a task needs them.
2. Run `git status` and `git log --oneline -10` on branch `phase/3-scoring`.
3. Check every task listed under "In flight" (section 3). Agents die with the session, so any uncommitted files in their paths are partial work. Verify and commit, or discard and re-dispatch.
4. Run `pnpm verify` (Node 24 PATH prefix, `docs/brief-rules.md`) to confirm a green baseline. Show only counts and failures.
5. Continue with "Next steps" (section 4), in order.

## 2. Where things stand

- **Phases 0 to 2 done** (G0, G1, G2 PASS; tags `gate-G0`, `gate-G1`, `gate-G2`). Phase 2 history: `docs/archive/progress-phase2.md`, gate report `docs/gates/G2.md`.
- **Branch:** `phase/3-scoring`, created from `main` at the G2 merge. Batches A through G done (T3.1 through T3.7); Batch H (T3.8a, T3.8b) done and committed: `78d8f34` (T3.8a Lineup page), `dbf69f0` (T3.8b Home card + design backlog), `352af52` (same-day hotfix: `readPositionCv` pooled-variance bug, ADR-013 item 21), `7bf57e3` (code review fixes: Lineup `?roster=` 404 ambiguity, `league/teams` missing `totalRosters`). See `docs/PROGRESS.md`'s Phase 3 task table for the full commit list.
- **Baseline after `066fc44`:** `pnpm verify` 97 files, 954 unit tests, 0 lint warnings.
- **Four Level 2 code/UX reviews run, all fully closed:** `docs/reviews/2026-10-02-p3-batchABC-code.md`, `docs/reviews/2026-10-02-p3-batchDEF-code.md`, `docs/reviews/2026-10-02-p3-t37-code.md` (see their fix commits in PROGRESS.md), `docs/reviews/2026-10-03-p3-batchH-code.md` (fixed `7bf57e3`), `docs/reviews/2026-10-03-p3-batchH-ux.md` (fixed `765a18d`, `066fc44`). One item remains open, not yet fixed: `e2e/pages.spec.ts` STATE-3 still expects the old Lineup stub page; folded into T3.9's brief below (qa-engineer owns `e2e/`).
- **UX review of Batch H** (`docs/reviews/2026-10-03-p3-batchH-ux.md`): two Major findings, both fixed and committed: M1/M3 lime-accent and swap-list truncation (`765a18d`), M2 Safe/Upside degenerate at week 4 (`066fc44`, lowered `MIN_WEEKS_FOR_PLAYER_CV` to 2, added `MIN_PLAYERS_FOR_POSITION_CV = 2` breadth guard). ADR-013 item 23 has the full writeup.
- **Design:** ADR-011 (with its purple amendment) is the visual identity: #FFFFFF, #2A2A2A, #D9D9D9, lime #D5FC51 (fill only on light grounds), blue #2147E8/#8FA8FF, neon purple #DF00FE (non-text or large text; black text on it), Inter, corners at most 4px, dense, scoreboard feel. Phase 3 UI must follow it.
- **Local data:** `./data` (gitignored) holds a live-synced DB. Never take screenshots from it (ADR-009 item 17). The worker now fills `sleeper_user_id` for env-seeded identity (G2-B1); Steph restarts `pnpm dev:worker` to pick it up.

## 3. In flight

- Nothing. Clean point to `/clear`.

## 4. Next steps (in order)

1. Dispatch Batch I: T3.9 (qa-engineer, e2e lineup flow: mode toggle, swaps, Open in Sleeper, opponent view), depends on T3.8a/b. **Must include in the brief:** fix `e2e/pages.spec.ts` STATE-3 (and STATE-2 if it shares the loop) to drop `"lineup"` from the stub-page assertion loop — T3.8a replaced that stub with a real page (`data-testid="lineup-page"`, not `"stub-page"`); this is currently a known-red e2e test (docs/reviews/2026-10-03-p3-batchH-code.md finding M1, docs/reviews/2026-10-03-p3-batchH-ux.md finding M4).
2. After T3.8/T3.9 land and are reviewed, Phase 3 is done pending G3 (human checkpoint, PLAN 9): SCORE-2 at least 99% match on Steph's real league, LINEUP-7 benchmark, backtest report and alpha/beta decision logged (T3.5c's real run against live data, not the fixture smoke test already done). Run these live checks before writing the gate report.
3. Watch the settings route JS headroom (800 B) and the gallery budget when adding UI.

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
