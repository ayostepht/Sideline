# Handoff

Single source for resuming after a session limit or `/clear`. The orchestrator updates this file and commits it after every task commit, review, and dispatch. If it disagrees with `git log`, trust `git log` and fix this file.

Last updated: 2026-10-03. Phase 3 Batch H (T3.8a, T3.8b: Lineup page, Home card, design backlog) landed, committed, and Level 2 reviewed (code + UX). Two Major UX findings have fixes **in flight right now** (background agents) — see section 3 before doing anything else. NOT a clean point to `/clear` until section 3 is empty and `pnpm verify` is green.

## 1. Resume in five steps

1. Read `CLAUDE.md`, then this file, then `docs/PROGRESS.md` and the "Rules in force" list at the top of `docs/DECISIONS.md`. Read PLAN.md only by section: section 9 for the current phase, section 10 for gates, and whatever sections the next task cites. Open full ADRs, reviews and `docs/archive/` only when a task needs them.
2. Run `git status` and `git log --oneline -10` on branch `phase/3-scoring`.
3. Check every task listed under "In flight" (section 3). Agents die with the session, so any uncommitted files in their paths are partial work. Verify and commit, or discard and re-dispatch.
4. Run `pnpm verify` (Node 24 PATH prefix, `docs/brief-rules.md`) to confirm a green baseline. Show only counts and failures.
5. Continue with "Next steps" (section 4), in order.

## 2. Where things stand

- **Phases 0 to 2 done** (G0, G1, G2 PASS; tags `gate-G0`, `gate-G1`, `gate-G2`). Phase 2 history: `docs/archive/progress-phase2.md`, gate report `docs/gates/G2.md`.
- **Branch:** `phase/3-scoring`, created from `main` at the G2 merge. Batches A through G done (T3.1 through T3.7); Batch H (T3.8a, T3.8b) done and committed: `78d8f34` (T3.8a Lineup page), `dbf69f0` (T3.8b Home card + design backlog), `352af52` (same-day hotfix: `readPositionCv` pooled-variance bug, ADR-013 item 21), `7bf57e3` (code review fixes: Lineup `?roster=` 404 ambiguity, `league/teams` missing `totalRosters`). See `docs/PROGRESS.md`'s Phase 3 task table for the full commit list.
- **Baseline after `7bf57e3`:** `pnpm verify` 953 unit tests, 0 lint warnings.
- **Four Level 2 code reviews run; three fully closed, one (Batch H) has two Major fixes in flight:** `docs/reviews/2026-10-02-p3-batchABC-code.md`, `docs/reviews/2026-10-02-p3-batchDEF-code.md`, `docs/reviews/2026-10-02-p3-t37-code.md` all closed (see their fix commits in PROGRESS.md). `docs/reviews/2026-10-03-p3-batchH-code.md`: two Majors, both fixed (`7bf57e3`); `e2e/pages.spec.ts` STATE-3 stub-page regression folded into T3.9, not yet fixed.
- **UX review of Batch H just ran** (`docs/reviews/2026-10-03-p3-batchH-ux.md`): two Major findings (M1 lime-accent inconsistency between Home/Lineup, M2 Safe/Upside render identical to Projected at week 4 of the season because the `352af52` fix's `MIN_WEEKS_FOR_PLAYER_CV = 4` means nobody qualifies yet). **Fixes dispatched as background agents; see section 3, resume there first.** ADR-013 item 23 has the full writeup.
- **Design:** ADR-011 (with its purple amendment) is the visual identity: #FFFFFF, #2A2A2A, #D9D9D9, lime #D5FC51 (fill only on light grounds), blue #2147E8/#8FA8FF, neon purple #DF00FE (non-text or large text; black text on it), Inter, corners at most 4px, dense, scoreboard feel. Phase 3 UI must follow it.
- **Local data:** `./data` (gitignored) holds a live-synced DB. Never take screenshots from it (ADR-009 item 17). The worker now fills `sleeper_user_id` for env-seeded identity (G2-B1); Steph restarts `pnpm dev:worker` to pick it up.

## 3. In flight

Two background subagents dispatched 2026-10-03 to fix the UX review's two Major findings (section 2, ADR-013 item 23). **If this session ends before their completion notifications arrive, check `git status` and `git log --oneline -5` on `phase/3-scoring` first** — an agent's edits land as uncommitted working-tree changes until the orchestrator verifies and commits them; they do not survive a session end on their own if still mid-flight, so either finish verifying/committing them or they were never applied and need re-dispatching.

1. **Frontend fix (M1 + M3):** unify Lineup's summary banner (`apps/web/app/l/[leagueId]/lineup/_components/summary-banner.tsx`) to the same vivid `bg-primary`/`text-primary-foreground` lime treatment Home's card uses (currently `bg-accent-soft`), and fix ambiguous player-name truncation in the swap list at 390px (`apps/web/app/l/[leagueId]/lineup/_components/swap-list.tsx`). Scope: those two files plus their tests only.
2. **Backend fix (M2):** `apps/web/lib/server/lineup.ts`'s `readPositionCv` and its `MIN_WEEKS_FOR_PLAYER_CV = 4` constant (introduced by `352af52` earlier the same day) leaves the position-CV prior empty at week 4 of a season (today's real week), collapsing Safe/Upside to equal Projected for every player. Fix lowers/restructures the per-player minimum so early-season leagues still get a non-degenerate prior, with a new regression test proving real floor/ceiling separation. Scope: `apps/web/lib/server/lineup.ts` and its test file only.

When each lands: run `pnpm verify` yourself (Level 1), check `git diff --stat` matches the stated scope, commit with the task id, then continue to section 4.

## 4. Next steps (in order)

1. Once both in-flight fixes (section 3) are verified and committed, re-run `pnpm verify` once more on the combined state, then consider a short Level 2 re-check specifically on the two fixed files (a full second code-reviewer/ux-reviewer pass is optional at the orchestrator's discretion; these are narrow, well-scoped fixes to already-reviewed findings).
2. Dispatch Batch I: T3.9 (qa-engineer, e2e lineup flow: mode toggle, swaps, Open in Sleeper, opponent view), depends on T3.8a/b. **Must include in the brief:** fix `e2e/pages.spec.ts` STATE-3 (and STATE-2 if it shares the loop) to drop `"lineup"` from the stub-page assertion loop — T3.8a replaced that stub with a real page (`data-testid="lineup-page"`, not `"stub-page"`); this is currently a known-red e2e test (docs/reviews/2026-10-03-p3-batchH-code.md finding M1, docs/reviews/2026-10-03-p3-batchH-ux.md finding M4).
3. After T3.8/T3.9 land and are reviewed, Phase 3 is done pending G3 (human checkpoint, PLAN 9): SCORE-2 at least 99% match on Steph's real league, LINEUP-7 benchmark, backtest report and alpha/beta decision logged (T3.5c's real run against live data, not the fixture smoke test already done). Run these live checks before writing the gate report.
4. Watch the settings route JS headroom (800 B) and the gallery budget when adding UI.

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
