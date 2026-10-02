# Handoff

Single source for resuming after a session limit or `/clear`. The orchestrator updates this file and commits it after every task commit, review, and dispatch. If it disagrees with `git log`, trust `git log` and fix this file.

Last updated: 2026-10-02, after gate G1 PASS (14d4305), merged to `main` and tagged `gate-G1`. Phase 2 not started.

## 1. Resume in five steps

1. Read `CLAUDE.md`, then this file. Read `docs/PROGRESS.md` (task table, backlog) and `docs/DECISIONS.md` (ADR-005 to ADR-007) only as needed.
2. Run `git status` and `git log --oneline -10` on branch `phase/1-data`.
3. Check every task listed under "In flight" (section 3). Agents die with the session, so any uncommitted files in their paths are partial work. For each one, either:
   - verify it against that task's acceptance criteria and commit it if everything passes, or
   - discard it (`git checkout -- <paths> && git clean -fd <paths>`) and re-dispatch the task.
4. Run `pnpm verify` (Node 24 PATH prefix, section 6) to confirm a green baseline.
5. Continue with "Next steps" (section 4), in order.

## 2. Where things stand

- **Phase 1 done.** G1 PASS on 2026-10-02 (`docs/gates/G1.md`): `pnpm gate --amd64` 10 of 10, live contract run once, live smoke sync into `./data` (third run 0 rows changed, `/players/nfl` once). Merged `phase/1-data` to `main` with `--no-ff`, tag `gate-G1`, no push.
- **Baseline:** `pnpm verify` 505 unit tests; `pnpm test:integration` 22; e2e 33; coverage 94.7% lines.
- **Local data:** `./data` (gitignored) holds a live-synced DB from 2026-10-02. The worker CLI does not load `.env`: run `set -a && . ./.env && set +a` first, and pass an absolute `DATA_DIR`.
- **Backlog:** Minor review items and follow-ups are in PROGRESS.md. Notable for Phase 2: route JS headroom (132 of 200 KB on the placeholder), the league-job skip reason log, and the `degraded` sync status.

## 3. In flight

Nothing.

## 4. Next steps (in order)

1. Tell Steph G1 passed and it is a good moment to `/clear`.
2. **Phase 2 planning** (gate G2, human): create branch `phase/2-shell` from `main`. Break PLAN section 9 Phase 2 (T2.1 design system and shell, T2.2 server data functions and DTOs, and the rest) into tasks in PROGRESS.md. Contracts first: T2.2 shared DTOs before frontend pages fan out. Present the plan to Steph for approval before dispatching, as in Phase 1.

## 5. Standing rules for every brief

- Node 24: prefix shell commands with `export PATH="$HOME/.local/share/fnm/node-versions/v24.21.0/installation/bin:$PATH"`.
- Real identifiers (username, league id, league name, user ids, manager and team names) come only from `.env` and never go into tracked files (ADR-000).
- Use msw 3 APIs. No `.skip` or `.only`, no weakened thresholds, no unjustified lint disables.
- Only devops-engineer changes dependencies (ADR-005 item 15). Agents report missing dependencies instead of installing them.
- Agents report failures in other agents' paths rather than fixing them.
- The CLI is `pnpm run sync`, not `pnpm sync` (pnpm 12 has a built-in `sync`).
- Partial week 4 is excluded from golden expectations and SCORE-2.
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
