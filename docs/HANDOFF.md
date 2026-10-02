# Handoff

Single source for resuming after a session limit or `/clear`. The orchestrator updates this file and commits it after every task commit, review, and dispatch. If it disagrees with `git log`, trust `git log` and fix this file.

Last updated: 2026-10-02, Phase 2 Batch F (T2.6a to d done; T2.6d left one known flake, TEAM-3, logged as a question for Steph; code and ux review of the full Batch F diff in flight). Plan: ADR-009 and the PROGRESS Phase 2 table.

## 1. Resume in five steps

1. Read `CLAUDE.md`, then this file, then `docs/PROGRESS.md` and the "Rules in force" list at the top of `docs/DECISIONS.md`. Read PLAN.md only by section: section 9 for the current phase, section 10 for gates, and whatever sections the next task cites. Open full ADRs, reviews and `docs/archive/` only when a task needs them.
2. Run `git status` and `git log --oneline -10` on branch `phase/2-shell`.
3. Check every task listed under "In flight" (section 3). Agents die with the session, so any uncommitted files in their paths are partial work. Verify and commit, or discard and re-dispatch.
4. Run `pnpm verify` (Node 24 PATH prefix, `docs/brief-rules.md`) to confirm a green baseline. Show only counts and failures.
5. Continue with "Next steps" (section 4), in order.

## 2. Where things stand

- **Phase 1 done** (G1 PASS, tag `gate-G1`). **Phase 2 in progress** on `phase/2-shell`; T2.0 to T2.5b committed.
- **Baseline:** `pnpm verify` 710 unit tests; integration 23; e2e 285 (TEAM-3 flakes about 1 in 9-45 runs under parallel load, known issue, see PROGRESS backlog and Questions). Route JS: `/l/[leagueId]` about 161.6 KB, settings 168.5 KB, gallery 189.2 KB (not rechecked after T2.6d; expect no material change, markup/logic only).
- **Local data:** `./data` (gitignored) holds a live-synced DB. Never take screenshots from it (ADR-009 item 17).

## 3. In flight

- Batch F code review (code-reviewer) and ux review (ux-reviewer) of the full Batch F diff (976a355..bdca45e), both dispatched, awaiting results. If either comes back with Blocker/Major findings, fix before G2.

## 4. Next steps (in order)

1. Read the code-reviewer and ux-reviewer reports when they land; fix Blocker/Major findings (small ones directly if under 15 lines, else back to frontend-engineer); save reports to `docs/reviews/2026-10-02-p2-batchF2-code.md` and `-ux.md` (or similar); Minor findings go to the PROGRESS backlog.
2. Decide the TEAM-3 flaky test question (see PROGRESS "Questions for Steph") before or as part of the G2 gate: `apps/web/lib/client/nav.ts`'s `resolvePendingAfterUrlChange` and the five new `loading.tsx` files (settings, lineup, matchup, players, waivers) are done and verified (T2.6d, commit bdca45e); only the TEAM-3 e2e flake under heavy parallel load remains open, root-caused but with no fix available in frontend-engineer's owned paths.
3. G2 gate: `pnpm gate --amd64`; code-reviewer on `git diff main...phase/2-shell`; full coverage run; live onboarding by the orchestrator (about 22 calls); LAN check (`pnpm dev:lan` plus a request with a non-localhost Origin); archive 390 and 1280 px screenshots from the seeded dir to `docs/gates/G2/screens/` after eyeballing each; write `docs/gates/G2.md`; stop for Steph with run instructions (LAN URL, `dev:lan` and worker commands, macOS firewall prompt) and questions (including TEAM-3).

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
