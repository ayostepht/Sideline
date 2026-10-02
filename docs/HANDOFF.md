# Handoff

Single source for resuming after a session limit or `/clear`. The orchestrator updates this file and commits it after every task commit, review, and dispatch. If it disagrees with `git log`, trust `git log` and fix this file.

Last updated: 2026-10-02, after commit 4b021b2 (T1.5a-fix). Batch D committed (847c7e0, fe43bdd, eeaf97d, 3091394); Batch D code review in flight.

## 1. Resume in five steps

1. Read `CLAUDE.md`, then this file. Read `docs/PROGRESS.md` (task table, backlog) and `docs/DECISIONS.md` (ADR-005 to ADR-007) only as needed.
2. Run `git status` and `git log --oneline -10` on branch `phase/1-data`.
3. Check every task listed under "In flight" (section 3). Agents die with the session, so any uncommitted files in their paths are partial work. For each one, either:
   - verify it against that task's acceptance criteria and commit it if everything passes, or
   - discard it (`git checkout -- <paths> && git clean -fd <paths>`) and re-dispatch the task.
4. Run `pnpm verify` (Node 24 PATH prefix, section 6) to confirm a green baseline.
5. Continue with "Next steps" (section 4), in order.

## 2. Where things stand

- **Phase:** 1, data layer and sync (gate G1). Plan approved by Steph with changes: ADR-005. nflverse facts: ADR-006. Webpack build: ADR-007.
- **Done and committed:**
  - B0, T1.0;
  - T1.1, T1.2a, T1.3a (each plus its review fix);
  - T1.4a, T1.2b, T1.4b, T1.3b, T1.5a;
  - T1.6 plus the T1.6-build devops fix, and T1.6-fix (be35d5f, shared `SYNC_CADENCE_MS`);
  - T1.5a-fix (4b021b2);
  - Batch D: T1.8 (847c7e0), T1.7a (fe43bdd, root scripts 3091394), T1.5b (eeaf97d).

  Commit ids are in the PROGRESS.md task table.
- **Reviews:** saved in `docs/reviews/2026-10-02-p1-*`. Batch A, B and C findings are all fixed (Minor items in the PROGRESS backlog).
- **Last full check:** `pnpm verify` green (479 tests), `pnpm test:coverage` thresholds pass (94% lines), `pnpm test:integration` 5 passed, container health verified. `pnpm build` passes. Standalone `/api/health` returns 200 "degraded" on an empty `DATA_DIR`.

## 3. In flight

| Task | Agent | Writes to | Done when |
|---|---|---|---|
| Batch D code review (`git diff 0aed7c8..3091394`) | code-reviewer | nothing (read-only) | Report returned; save it as `docs/reviews/2026-10-02-p1-batchD-code.md`, then fix Blocker and Major findings before Batch E. If lost, re-dispatch the review. |

## 4. Next steps (in order)

1. **Batch D review fixes**: Blocker and Major findings from the review, dispatched to the owning agents.
2. **Batch E: T1.5c** (sleeper-data-engineer):
   - the nflverse job through `createNflverseProvider` (ok and degraded both work when the flag is off or a download fails);
   - compute the ADR-002 fallback kickoff when `kickoffApproximate`;
   - pin the kickoff `Z` format with a test (Batch C m7);
   - the derived-table recompute hook (an empty registry until T3.2);
   - run nflverse before projections in `ALL_ORDER` so pregame snapshots have kickoffs (T1.5b follow-up);
   - `db:seed:fixtures`: a full worker sync from a fixture-backed fetch into `DATA_DIR`.

   Then a code review.
3. **Batch F: T1.7b** (qa-engineer), integration suites:
   - a full sync from fixtures with per-table counts;
   - idempotency: the second run has `rows_changed = 0`;
   - MSW 500, 429 and timeout failures;
   - a simulated game-window hour: no 60 s window above 300 calls, average at most 60 per minute, `/players/nfl` at most once;
   - nflverse disabled and nflverse failing;
   - a POST to the API picked up by the worker;
   - CLI cases: worker alive, no worker, lease held, and a run longer than the lease expiry.

   Then a code review.
4. **G1 gate.** The checklist is in the plan (ADR-005 plus PLAN section 9 G1 checks). It includes:
   - `pnpm test:contract` run live once;
   - the orchestrator live smoke: `pnpm run sync --once` into a gitignored `./data`, the day's single `/players/nfl` fetch, then a second run with near-zero changes;
   - `pnpm fixtures:check` and an identifier scan;
   - write `docs/gates/G1.md`, merge `--no-ff` to `main`, tag `gate-G1`, no push;
   - then tell Steph it's a good moment to `/clear` before Phase 2.

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
