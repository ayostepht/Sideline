# Progress archive: Phase 3 (scoring, projections, lineup optimizer)

Moved out of `docs/PROGRESS.md` on 2026-10-03 after G3 PASS (Steph approved; tag `gate-G3`).
History only: items still open were copied to the PROGRESS backlog under "Carried from Phase 3".

## Phase 3 task table

Split per ADR-013. Batches ran in order A to I; tasks in the same batch ran in parallel (disjoint
files, no dependency on each other's output). G3-FIX-1/2 were found and fixed during the gate
itself, against live data, after all Batch A-I tasks were already done.

| ID | Title | Agent | Depends | Batch | Status | Attempts | Commit |
|---|---|---|---|---|---|---|---|
| T3.1 | Scoring engine (SCORE-1, SCORE-3) and validation harness (SCORE-2) with report | analytics-engineer | G2 | A | Done | 1 | 4a73f30 |
| T3.2a | `packages/db` upsert helpers for `league_player_week_points`, `defense_vs_position` | backend-engineer | G2 | A | Done | 1 | 22d3630 |
| T3.2c | `packages/db` read helpers: `player_week_stats`, `player_week_projections`, `leagues` content | backend-engineer | G2 | B | Done | 1 | 91a2b78 |
| T3.3a | Projections part 1: PROJ-1 base rescore, PROJ-4 rest-of-season | analytics-engineer | T3.1 | B | Done | 1 | 104f08d |
| T3.4a | Optimizer part 1: Hungarian solver, slot and eligibility resolution (LINEUP-1, 2, 9) | analytics-engineer | T3.1 | B | Done | 1 | ed071b4 |
| T3.2b | Worker recompute hook materializing `league_player_week_points` after sync | sleeper-data-engineer | T3.1, T3.2a, T3.2c | C | Done | 1 | 749388e |
| T3.3b | Projections part 2: PROJ-2 variance and shrinkage, PROJ-3 floor and ceiling | analytics-engineer | T3.3a | C | Done | 1 | e26905e |
| T3.4b | Optimizer part 2: locks, availability, modes, reasons and issues output, perf (LINEUP-3 to 7) | analytics-engineer | T3.4a | C | Done | 1 | 160810e |
| T3.5a | Matchup core: MATCH-1 DvP, MATCH-2 multiplier, MATCH-4 grade (alpha/beta default to 0/0) | analytics-engineer | T3.2b, T3.3b | D | Done | 1 | 0f42b67 |
| T3.6 | Golden optimizer scenarios (12+) and property tests (1000+ runs, LINEUP-8) | qa-engineer | T3.4b | D | Done | 1 (+2 fix rounds) | d2550d4, fixes 6137927 |
| T3.2e | `packages/db` read helpers: `players` (team/position), `schedule`, `league_player_week_points` content | backend-engineer | G2 | E | Done | 1 | edc3057 |
| T3.5c | MATCH-3 backtest harness: grid-search alpha/beta, update T3.5a's constant if it clears the 1% MAE bar, report | analytics-engineer | T3.5a | E | Done | 1 | e022826 |
| T3.5b | Worker recompute hook materializing `defense_vs_position` (calls T3.5a) | sleeper-data-engineer | T3.5a, T3.2a, T3.2e | F | Done | 1 | c3ba684 |
| T3.7 | Lineup data function and API with caching | backend-engineer | T3.4b, T3.5b | G | Done | 1 | 5870660 |
| T3.8a | Lineup page | frontend-engineer | T3.7 | H | Done | 1 | 78d8f34 |
| T3.8b | Home "This week" lineup issues card; carried Phase 2 design backlog (scoreboard hero, lime accent, You badge, roster stat slot) | frontend-engineer | T3.7 | H | Done | 1 | dbf69f0 |
| T3.9 | E2E lineup flow (mode toggle, swaps, Open in Sleeper, opponent view) | qa-engineer | T3.8a, T3.8b | I | Done | 1 | 93edfc0 |
| G3-FIX-1 | statsJob self-heals missed current-season weeks (found live: SCORE-2 blocked at 38% by missing 2026 wk1-2) | sleeper-data-engineer | T3.2b | gate | Done | 1 | 51a1a31 |
| G3-FIX-2 | backfill_2025 also syncs the 2025 nflverse schedule (found live: MATCH-3 backtest silently dropped every 2025 player-week) | sleeper-data-engineer | T3.5b | gate | Done | 1 | 5fda4f6 |

**G3 phase checks:** SCORE-2 **100.00% match, 457 player-weeks, weeks 1-3** on Steph's real league
(live run 2026-10-03, after G3-FIX-1); golden and property tests pass; LINEUP-7 benchmark passes;
backtest report exists and the alpha/beta decision is logged (`docs/backtests/2026-10-03.md`,
live run after G3-FIX-2: **5323 player-weeks, decision raw_only, 0.14% MAE improvement**, below
the 1% bar; ADR-014 resolution). Full gate report: `docs/gates/G3.md`, PASS, Steph approved
2026-10-03.

## Phase 3 backlog as of G3 (history)

- G3 gate qa run (`pnpm gate`, 11/11): two backlog items found, not blocking. `lighthouserc.json`
  still only measures Home and League; Lineup (T3.8) was never added (devops/qa follow-up).
  Lineup route JS is 178,735 B, over the 170,000 B soft target (though under the 200,000 B hard
  budget) -- frontend-engineer look before Phase 4 adds more client code there.
- G3 gate code review (`docs/reviews/2026-10-03-G3-code.md`): one Blocker (`EXPECTED_COUNTS`
  stale against G3-FIX-1's fixture-sync change, broke `test:integration`; found independently by
  both code-reviewer and qa-engineer, fixed commit `465ceb2`), one Minor (`scheduleAlreadyStored`
  uses raw SQL instead of a typed `packages/db` helper, inconsistent with its siblings, backlog),
  one Informational (`backfillJob` re-degrades the nflverse portion every manual run when
  disabled, harmless).
- G3 gate UX review (`docs/reviews/2026-10-03-G3-ux.md`): UI4 PASSES, zero Blocker/Major. Three
  new Minors, not blocking: m1 Lineup's summary banner says "projected" even in Safe/Upside mode;
  m2 the banner's rounded total can disagree with its own swap rows (e.g. a signed "-0.0 pts")
  and has no zero-delta floor like Home's `hasSwaps` guard; m3 "this is your team" uses two
  different badge variants on the same Home page (`variant="accent"` on the team card vs.
  `variant="you"` elsewhere) -- recommend standardizing on `variant="you"`.
- **`readPositionCv` (T3.7) pooled between-player variance instead of averaging within-player CV,
  collapsing Safe mode's floor to 0 for most low-sample players (found in T3.8a frontend QA,
  fixed commit 352af52, ADR-013 item 21).** See ADR-013 item 21 for the full writeup and
  regression test.
- Batch H code review (`docs/reviews/2026-10-03-p3-batchH-code.md`): two Major findings, both
  fixed (commit `7bf57e3`): the Lineup page's `?roster=` 404 ambiguity, and
  `league/teams/[rosterId]` missing `totalRosters`. `e2e/pages.spec.ts`'s STATE-3 still expected
  the old Lineup stub; folded into T3.9's brief rather than fixed there. Open minors:
  `readPositionCv`'s single-qualifying-player-per-position case is correct but untested;
  `packages/db`'s `computed_cache` keys only on data-input timestamps, never algorithm version,
  so a running instance could keep serving a pre-fix cached lineup until the next relevant sync
  (same shape as the cache-staleness note below).
- Batch H UX review (`docs/reviews/2026-10-03-p3-batchH-ux.md`): two Major findings, both fixed.
  M1 (Lineup's summary banner used a muted lime tint instead of matching Home's vivid accent) and
  M3 (swap-list name truncation ambiguity at 390px): fixed commit `765a18d`. M2 (Safe/Upside
  render identical to Projected at week 4 of the season because nobody has 4 of their own weeks
  yet): fixed commit `066fc44` (`MIN_WEEKS_FOR_PLAYER_CV` lowered to 2, new
  `MIN_PLAYERS_FOR_POSITION_CV = 2` breadth guard). See ADR-013 item 23. Open minor m2 (flaky axe
  contrast finding on `/settings` dark theme) did not reproduce in the G3 gate UX review's two
  clean a11y runs.
- T3.7 code review (`docs/reviews/2026-10-02-p3-t37-code.md`, ADR-013 item 20): one Major
  (currentAssignment could misalign with resolveSlots on an unknown slot type, fixed commit
  438ffdd). Open minors: `matchupMultiplier`'s own clamp/avg-unavailable reasons aren't surfaced
  in the player DTO (inconsequential while alpha/beta are 0, confirmed to stay 0 by the real G3
  backtest); a `schedule` coverage gap for a team/week silently reads as "not locked"
  (pre-existing); a player missing from `players` or a zero-eligible-player roster are handled
  defensively but untested; `applyAvailability` runs twice with identical inputs (redundant, not
  a correctness bug).
- **Lineup cache (`getLineup`, T3.7) doesn't invalidate on an nflverse-only sync (ADR-013 item
  19).** Zero impact today since the matchup multiplier is a no-op (alpha/beta default 0,
  confirmed correct by the real G3 backtest); add `nflverse`'s `lastSuccessAt` to
  `inputsHashFor` in `apps/web/lib/server/lineup.ts` if a future backtest ever ships a non-zero
  alpha/beta.
- **T3.6's property suite found two real bugs within its first run, both fixed same-day (ADR-013
  item 14).** A locked current starter could be double-booked into a second eligible slot
  (`recommendLineup` excluded a locked player from the solver pool only when they weren't a
  current starter; fixed by excluding every locked player, commit 6137927). The property test's
  own `genAlternativeLineup` comparison generator had the identical bug class in its
  baseline-building logic, producing a false failure; fixed in the same style (commit d2550d4).
  Worth remembering as a model case for why LINEUP-8's property suite exists.
- Batch D-F code review (`docs/reviews/2026-10-02-p3-batchDEF-code.md`, ADR-013 item 17): one
  Major (non-deterministic stats-source precedence in two DvP joins, fixed commit c2c6da2), both
  ratified ownership notes logged (ADR-013 items 16-17). Open minors: `matchupGrade` has no
  `totalTeams === 0` guard (unreachable today, every caller passes 32); `defense_vs_position`'s
  worker hook recomputes every week from scratch each run (O(W^2), negligible at NFL scale).
- Batch A-C code review (`docs/reviews/2026-10-02-p3-batchABC-code.md`, ADR-013 item 12): one
  Blocker (optimizer could silently recommend an unavailable player, fixed commit 23bcad0) and
  one Major (embedded NUL byte in `league-points.ts`, fixed commit 346297d), both fixed and
  re-verified (`pnpm verify` 862 tests) before Batch D. Minor/informational items left open:
  `solve.ts`'s `TIEBREAK_EPSILON` undocumented at unrealistic (~1e15) value magnitudes;
  `scripts/validate-scoring/validate.ts` reads one player-week at a time rather than
  batch-reading (fine for a manual gate script, not a pattern for hot-path code);
  `rescoreProjection`'s `stats` parameter has no nominal type separating a projection row from a
  real stats row (no live bug, one correctly-scoped caller today).
