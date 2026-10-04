# Phase 5 archive: Matchups and league intelligence

G5 PASS 2026-10-03 (no human checkpoint, PLAN's gate table). Gate report: `docs/gates/G5.md`. Merged to `main`, tagged `gate-G5`.

## Task table

Batch letters and dependencies amended from PLAN.md's literal table per ADR-016 (logged in full in `docs/DECISIONS.md`, four amendments as each split was discovered): T5.3 got its own batch; T5.4 split into T5.4a/b/c/d (bulk DB read helpers; Matchup API; ROS roster-strength per team; league-intelligence API wiring the first three together); T5.5 split into T5.5a/b/c (Matchup page; League intelligence sections; Home win-probability card).

| ID | Task | Agent | Depends | Batch | Status | Attempts | Commit |
|---|---|---|---|---|---|---|---|
| T5.1 | Matchup Monte Carlo and swing players (SIM-1 to SIM-3), `packages/core/src/sim/` | analytics-engineer | G4 | A | Done | 1 | `605c13f`, `d321cab` |
| T5.2 | All-play, luck, power score, positional heatmap, manager tendencies (LEAGUE-1 to 4, 6), `packages/core/src/league/` | analytics-engineer | G4 | A | Done | 1 | `15f19b9` |
| T5.3 | Playoff odds (LEAGUE-5) | analytics-engineer | T5.1 | B | Done | 1 | `2ce52e9`, `f5a5f08` |
| T5.4a | `packages/db` read helpers: per-team weekly-score history, remaining-schedule pairings, league transactions, `playoffTeams` added to league settings read | backend-engineer | T5.1, T5.2, T5.3 | C1 | Done | 1 | `8995e67` |
| T5.4b | Matchup data function, response DTO, API route, `computed_cache` wiring | backend-engineer | T5.4a | C2 | Done | 1 | `76b68e5`, `c83fa45`, `9d40b23`, `311da63` |
| T5.4d | ROS-optimal-lineup roster strength per team (total and per-position), `apps/web/lib/server/roster-strength.ts` | backend-engineer | T5.4a | C2 | Done | 1 | `3ef1dad` |
| T5.4c | League intelligence data function, response DTO, API route, `computed_cache` wiring | backend-engineer | T5.4a, T5.4d | C3 | Done | 1 | `59b4338`, `a9efed0` |
| T5.5a | Matchup page (`matchup/page.tsx`, replaces the stub) | frontend-engineer | T5.4b | D | Done | 1 | `698c0fd`, `9d40b23`, `311da63` |
| T5.5b | League intelligence sections (`league/(list)/page.tsx`, appended) | frontend-engineer | T5.4c | D | Done | 1 | `d05ad4b`, `200513f` |
| T5.5c | Home win-probability card (`(main)/page.tsx`) | frontend-engineer | T5.4b | D | Done | 1 | `9ed83e3` |
| T5.6 | Tests: seeded determinism; symmetry; playoff odds sum to `playoff_teams` x 100% within 0.5%; perf; e2e matchup and league | qa-engineer | T5.5 | E | Done | 1 | `1b8cdc8`, `41599d0` |

**Decided at Phase 5 planning (ADR-016 item 5):** `getPlayerDetail`'s perf cost and the missing `upsertUsageWeek` wiring stayed in the backlog, not a dedicated task -- neither blocked any Phase 5 requirement.

## Batch review trail

Every batch reviewed (code-reviewer, plus ux-reviewer where UI changed); every Blocker/Major found was fixed same-session before the next batch started:

- **Batch A** (T5.1, T5.2): `docs/reviews/2026-10-03-p5-batchA-code.md`. One Major: `SimStarter.actualPointsSoFar` silently defaulting to 0 for finished/in-progress starters -- fixed via a discriminated union on `status`.
- **Batch B** (T5.3): `docs/reviews/2026-10-03-p5-batchB-code.md`. One Major: `playoffTeams`/`firstRoundByeCount` silently breaking the documented sum invariant when out of range -- fixed with validation that throws.
- **Batch C2** (T5.4b, T5.4d): `docs/reviews/2026-10-03-p5-batchC2-code.md`. One Major: bye-week starters getting a spurious nonzero simulated score -- fixed by zeroing them via `finished`/0, reusing `lineup.ts`'s existing bye-week detection (surfaced a pre-existing, unrelated Rams-specific `LAR`/`LA` team-code bye-detection gap along the way, logged to backlog, not fixed).
- **Batch C3** (T5.4c): `docs/reviews/2026-10-03-p5-batchC3-code.md`. One Major: playoff-odds' season-level `reasons` silently dropped from the response -- fixed by threading them through.
- **Batch D** (T5.5a, T5.5b, T5.5c): `docs/reviews/2026-10-03-p5-batchD-{code,ux}.md`. Code review: one Major (Matchup page hard-404ing on the preseason state instead of the friendly message every sibling page uses). UX review: one Blocker (positional-strength heatmap failing a real axe `scrollable-region-focusable` check at mobile widths, fixed by converting to the house table-on-desktop/cards-on-mobile pattern) and one Major (score-range chart using background-fill color tokens as foreground strokes, measuring as low as 1.07:1 contrast, fixed to 3.35-8.95:1 across both themes).
- **Batch E** (T5.6): `docs/reviews/2026-10-03-p5-batchE-code.md`. APPROVE, zero Blocker/Major, one trivial comment-accuracy Minor fixed directly by the orchestrator.
- **Gate (G5)**: `docs/reviews/2026-10-03-G5-{code,ux}.md`, both APPROVE. The gate's own `pnpm gate` run found and fixed two real flaky e2e tests (a non-retrying swap-row count assertion, a missing `settleAnimations()` call before axe scans on non-overlay routes) -- both test-infrastructure issues, not application regressions.

## What Phase 5 shipped

A seeded Monte Carlo matchup win-probability simulator with score percentiles and swing players (SIM-1 to SIM-3); six league-intelligence metrics -- all-play record, luck, power score, positional strength heatmap, playoff odds (Monte Carlo), manager tendencies (LEAGUE-1 to LEAGUE-6); the Matchup page; five new League page sections; a Home win-probability card; the `packages/db` bulk read helpers (weekly scores, remaining schedule, transactions) and ROS-optimal-lineup roster-strength computation that both the matchup and league-intelligence features needed; the full wired-path test suite (determinism, symmetry, playoff-odds-sum invariant, cold/warm perf budgets, e2e coverage) plus an honest, evidence-backed informational Brier-score calibration check (not computable from the recorded fixture, real root cause documented).

## G5 phase checks (from the gate report)

Statistical checks (seeded determinism, symmetry, playoff-odds sum within 0.5% of `playoffTeams`) pass at both the pure-math (`packages/core`) and wired-integration levels. Informational Brier score: not computable from the single-snapshot fixture (no week has both a stored pregame projection and a completed outcome); documented as a real fixture limitation, not a flaw in the simulation.
