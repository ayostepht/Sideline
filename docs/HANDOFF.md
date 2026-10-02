# Handoff

Single source for resuming after a session limit or `/clear`. The orchestrator updates this file and commits it after every task commit, review, and dispatch. If it disagrees with `git log`, trust `git log` and fix this file.

Last updated: 2026-10-02, Phase 2 plan approved (ADR-009), Batch 0 committed on `phase/2-shell`. Plan file: `~/.claude/plans/fresh-session-after-clear-radiant-umbrella.md` (ADR-009 and the PROGRESS Phase 2 table hold the same content).

## 1. Resume in five steps

1. Read `CLAUDE.md`, then this file. Read `docs/PROGRESS.md` (Phase 2 table, backlog) and `docs/DECISIONS.md` (ADR-009) as needed.
2. Run `git status` and `git log --oneline -10` on branch `phase/2-shell`.
3. Check every task listed under "In flight" (section 3). Agents die with the session, so any uncommitted files in their paths are partial work. Verify and commit, or discard and re-dispatch.
4. Run `pnpm verify` (Node 24 PATH prefix, section 6) to confirm a green baseline.
5. Continue with "Next steps" (section 4), in order.

## 2. Where things stand

- **Phase 1 done** (G1 PASS, tag `gate-G1`). **Phase 2 in progress** on `phase/2-shell`.
- **Baseline:** `pnpm verify` 505 unit tests; integration 22; e2e 33; coverage 94.7% lines.
- **Local data:** `./data` (gitignored) holds a live-synced DB. Never take screenshots from it (ADR-009 item 17).

## 3. In flight

Nothing.

## 4. Next steps (in order)

1. Batch A: dispatch T2.1a (frontend-engineer), T2.2a (backend-engineer), T2.0b (devops-engineer) in parallel, then code-reviewer on A0+A.
2. Batches B to G per the PROGRESS Phase 2 table and ADR-009. G2 is a human gate: stop for Steph.

## 5. Standing rules for every brief

- Node 24: prefix shell commands with `export PATH="$HOME/.local/share/fnm/node-versions/v24.21.0/installation/bin:$PATH"`.
- Real identifiers (username, league id, league name, user ids, manager and team names) come only from `.env` and never go into tracked files (ADR-000).
- Use msw 3 APIs. No `.skip` or `.only`, no weakened thresholds, no unjustified lint disables.
- Only devops-engineer changes dependencies (ADR-005 item 15). Agents report missing dependencies instead of installing them.
- Agents report failures in other agents' paths rather than fixing them.
- The CLI is `pnpm run sync`, not `pnpm sync` (pnpm 12 has a built-in `sync`).
- Partial week 4 is excluded from golden expectations and SCORE-2.
- Screenshots only from a fixture-seeded temp DATA_DIR; ux-reviewer captures stay in `.screens/` (ADR-009 item 17).
- UI copy plain and short, no em dashes; WCAG 2.1 AA; color never the only signal; 44 px targets; route JS target 170 KB (ADR-009 item 6).
- Tell agents the token budget is tight: work efficiently and keep reports short.

## 6. Before every commit (orchestrator)

1. Run `pnpm verify`. If a parallel agent's files are mid-edit, run targeted checks on the task's paths instead, then the full verify before the next batch.
2. Walk the acceptance criteria against real output. Confirm `git diff --stat` stays in the agent's paths.
3. Scan the staged diff for identifiers:
   ```
   set -a && . ./.env && set +a && git diff --cached | grep -c -e "$SLEEPER_USERNAME" -e "$DEFAULT_LEAGUE_ID"
   ```
   It must print 0.
4. Run `pnpm fixtures:check` when `tests/fixtures/` changed.
5. Commit with the task id and the attribution line, update the PROGRESS.md task table, then update sections 2 to 4 of this file and commit it.
