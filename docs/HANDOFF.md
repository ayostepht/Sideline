# Handoff

Single source for resuming after a session limit or `/clear`. The orchestrator updates this file and commits it after every task commit, review, and dispatch. If it disagrees with `git log`, trust `git log` and fix this file.

Last updated: 2026-10-02, Phase 3 Batches A through F done, two Level 2 code reviews run and all findings fixed; T3.7 (lineup API) dispatched, in flight.

## 1. Resume in five steps

1. Read `CLAUDE.md`, then this file, then `docs/PROGRESS.md` and the "Rules in force" list at the top of `docs/DECISIONS.md`. Read PLAN.md only by section: section 9 for the current phase, section 10 for gates, and whatever sections the next task cites. Open full ADRs, reviews and `docs/archive/` only when a task needs them.
2. Run `git status` and `git log --oneline -10` on branch `phase/3-scoring`.
3. Check every task listed under "In flight" (section 3). Agents die with the session, so any uncommitted files in their paths are partial work. Verify and commit, or discard and re-dispatch.
4. Run `pnpm verify` (Node 24 PATH prefix, `docs/brief-rules.md`) to confirm a green baseline. Show only counts and failures.
5. Continue with "Next steps" (section 4), in order.

## 2. Where things stand

- **Phases 0 to 2 done** (G0, G1, G2 PASS; tags `gate-G0`, `gate-G1`, `gate-G2`). Phase 2 history: `docs/archive/progress-phase2.md`, gate report `docs/gates/G2.md`.
- **Branch:** `phase/3-scoring`, created from `main` at the G2 merge. Batches A through F done (T3.1 through T3.6, T3.2c/e, T3.5a/b/c); see `docs/PROGRESS.md`'s Phase 3 task table for the full commit list.
- **Baseline after Batch F:** `pnpm verify` 919 unit tests, 0 lint warnings. `packages/core` coverage holding at or above 90%/85%.
- **Two Level 2 code reviews run and all findings fixed:** `docs/reviews/2026-10-02-p3-batchABC-code.md` (one Blocker: optimizer could recommend an unavailable player, fixed 23bcad0; one Major: NUL byte in a worker file, fixed 346297d) and `docs/reviews/2026-10-02-p3-batchDEF-code.md` (one Major: non-deterministic stats-source precedence in two DvP joins, fixed c2c6da2). T3.6's own property suite caught two more real bugs in `recommendLineup` and its own comparison generator, fixed same-day.
- **Design:** ADR-011 (with its purple amendment) is the visual identity: #FFFFFF, #2A2A2A, #D9D9D9, lime #D5FC51 (fill only on light grounds), blue #2147E8/#8FA8FF, neon purple #DF00FE (non-text or large text; black text on it), Inter, corners at most 4px, dense, scoreboard feel. Phase 3 UI must follow it.
- **Local data:** `./data` (gitignored) holds a live-synced DB. Never take screenshots from it (ADR-009 item 17). The worker now fills `sleeper_user_id` for env-seeded identity (G2-B1); Steph restarts `pnpm dev:worker` to pick it up.

## 3. In flight

- **T3.7** (backend-engineer): lineup data function + `GET /api/l/[leagueId]/lineup` + computed_cache wiring. Dispatched, not yet reported. If this session ends before it lands: check `git status` for files under `packages/shared/src/api/lineup.ts`, `packages/shared/src/reason.ts` (adds `ReasonSchema` only), `apps/web/lib/server/lineup.ts`, `apps/web/lib/server/api-handlers.ts`, `apps/web/app/api/l/[leagueId]/lineup/route.ts` — review against PLAN 5.4 (LINEUP-6), 5.3 (MATCH-2/4), and the already-built `recommendLineup`/`matchupMultiplier`/`matchupGrade`/`weeklyStandardDeviation`/`floorAndCeiling` in `packages/core` before committing.

## 4. Next steps (in order)

1. Once T3.7 lands: verify independently (acceptance criteria, scope, `pnpm verify`), then run a Level 2 code review on the cumulative diff since the Batch D-F review commit (`f5fc0e9`) given T3.7's complexity (it's the first real caller of `computed_cache`), fix any Blocker/Major findings, commit.
2. Then Batch G/H: T3.8a, T3.8b (frontend-engineer, Lineup page and Home "This week" card, both depend on T3.7) in parallel, folding the Phase 2 design backlog ("Carried from Phase 2": scoreboard hero, lime on content, Home "You" badge, roster stat slot) into T3.8b.
3. Then Batch I: T3.9 (qa-engineer, e2e lineup flow: mode toggle, swaps, Open in Sleeper, opponent view), depends on T3.8a/b.
4. Watch the settings route JS headroom (800 B) and the gallery budget when adding UI.
5. Good point to suggest `/clear` to Steph once T3.7 lands and is committed — this file is enough to resume.

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
