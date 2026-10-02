# Handoff

Single source for resuming after a session limit or `/clear`. The orchestrator updates this file and commits it after every task commit, review, and dispatch. If it disagrees with `git log`, trust `git log` and fix this file.

Last updated: 2026-10-02, G2 automated checks PASS (gate re-run 11/11 after M1 fix 1aaa95d), live onboarding and LAN check done, `docs/gates/G2.md` written. Waiting for Steph's G2 human checkpoint.

## 1. Resume in five steps

1. Read `CLAUDE.md`, then this file, then `docs/PROGRESS.md` and the "Rules in force" list at the top of `docs/DECISIONS.md`. Read PLAN.md only by section: section 9 for the current phase, section 10 for gates, and whatever sections the next task cites. Open full ADRs, reviews and `docs/archive/` only when a task needs them.
2. Run `git status` and `git log --oneline -10` on branch `phase/2-shell`.
3. Check every task listed under "In flight" (section 3). Agents die with the session, so any uncommitted files in their paths are partial work. Verify and commit, or discard and re-dispatch.
4. Run `pnpm verify` (Node 24 PATH prefix, `docs/brief-rules.md`) to confirm a green baseline. Show only counts and failures.
5. Continue with "Next steps" (section 4), in order.

## 2. Where things stand

- **Phase 1 done** (G1 PASS, tag `gate-G1`). **Phase 2 in progress** on `phase/2-shell`; T2.0 to T2.5b committed.
- **Baseline:** `pnpm verify` 710 unit tests; integration 23; e2e 286 (added MYTEAM-3; TEAM-3 flakes about 1 in 9-45 runs under parallel load, known issue, see PROGRESS backlog and Questions). Route JS: `/l/[leagueId]` about 161.6 KB, settings 168.5 KB, gallery 189.2 KB (not rechecked after T2.6d; expect no material change, markup/logic only).
- **Local data:** `./data` (gitignored) holds a live-synced DB. Never take screenshots from it (ADR-009 item 17).

## 3. In flight

- Nothing. Waiting on Steph's replies to the G2 questions (`docs/gates/G2.md`, Human checkpoint). Do not start Phase 3.

## 4. Next steps (in order)

1. Apply Steph's G2 answers: TEAM-3 decision; any UX minors she wants now (frontend-engineer); re-run affected checks, then the full gate if code changed.
2. On approval: merge `phase/2-shell` to `main`, tag `gate-G2`, archive the Phase 2 task table to `docs/archive/`, trim done backlog items, suggest `/clear`.
3. Phase 3: read PLAN.md section 9 Phase 3 in full plus every section it cites; plan batches.

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
