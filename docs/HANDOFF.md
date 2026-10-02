# Handoff

Single source for resuming after a session limit or `/clear`. The orchestrator updates this file and commits it after every task commit, review, and dispatch. If it disagrees with `git log`, trust `git log` and fix this file.

Last updated: 2026-10-02, Phase 2 closed: G2 PASS, Steph approved, merged to `main`, tag `gate-G2`. Phase 3 not started; branch `phase/3-scoring` created from `main`.

## 1. Resume in five steps

1. Read `CLAUDE.md`, then this file, then `docs/PROGRESS.md` and the "Rules in force" list at the top of `docs/DECISIONS.md`. Read PLAN.md only by section: section 9 for the current phase, section 10 for gates, and whatever sections the next task cites. Open full ADRs, reviews and `docs/archive/` only when a task needs them.
2. Run `git status` and `git log --oneline -10` on branch `phase/3-scoring`.
3. Check every task listed under "In flight" (section 3). Agents die with the session, so any uncommitted files in their paths are partial work. Verify and commit, or discard and re-dispatch.
4. Run `pnpm verify` (Node 24 PATH prefix, `docs/brief-rules.md`) to confirm a green baseline. Show only counts and failures.
5. Continue with "Next steps" (section 4), in order.

## 2. Where things stand

- **Phases 0 to 2 done** (G0, G1, G2 PASS; tags `gate-G0`, `gate-G1`, `gate-G2`). Phase 2 history: `docs/archive/progress-phase2.md`, gate report `docs/gates/G2.md`.
- **Branch:** `phase/3-scoring`, created from `main` at the G2 merge. Nothing on it yet.
- **Baseline at G2 (gate run 4):** `pnpm verify` 728 unit tests; integration 23; e2e 294 (3 main projects plus 3 chained `*-notfound` projects, ADR-012); axe 290; Lighthouse Home and League 98/100/96/100; route JS max 169,200 B (settings, target 170 KB: 800 B headroom); images about 100.8 MB, health under 2 s; lint warnings 0.
- **Design:** ADR-011 (with its purple amendment) is the visual identity: #FFFFFF, #2A2A2A, #D9D9D9, lime #D5FC51 (fill only on light grounds), blue #2147E8/#8FA8FF, neon purple #DF00FE (non-text or large text; black text on it), Inter, corners at most 4px, dense, scoreboard feel. Phase 3 UI must follow it.
- **Local data:** `./data` (gitignored) holds a live-synced DB. Never take screenshots from it (ADR-009 item 17). The worker now fills `sleeper_user_id` for env-seeded identity (G2-B1); Steph restarts `pnpm dev:worker` to pick it up.

## 3. In flight

- Nothing. Clean point to `/clear`.

## 4. Next steps (in order)

1. Start of Phase 3: read PLAN.md section 9 Phase 3 in full and every section it cites (SCORE, PROJ, LINEUP, MATCH requirements; 6.x for the Lineup page; 10 for G3 checks), plus `docs/sleeper-api-notes.md` sections on scoring settings, stats and projections, and ADR-002 (scoring rules, SCORE-3 exceptions, fallback lock times).
2. Plan Phase 3 batches from the PLAN table (T3.1 to T3.9), splitting anything over about 400 lines (the optimizer and projections likely split into a/b). Log splits and any PLAN amendments in a new ADR-013. Add the Phase 3 task table to PROGRESS.
3. Present the batch plan to Steph before dispatching, as at the start of Phase 2.
4. Fold the Phase 3 design follow-ups from the PROGRESS backlog ("Carried from Phase 2": scoreboard hero, lime on content, Home "You" badge, roster stat slot) into T3.8 (Lineup page and Home "This week" card).
5. Watch the settings route JS headroom (800 B) and the gallery budget when adding UI.

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
