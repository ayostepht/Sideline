# Progress archive: Phase 4 (waivers, players, trends, Docker beta)

Moved out of `docs/PROGRESS.md` on 2026-10-03 after G4 PASS (human checkpoint optional, tag
`gate-G4`). History only: items still open were copied to the PROGRESS backlog under "Carried
from Phase 4".

## Phase 4 task table

Batch split and dependency rationale: ADR-015. Batches ran in order A to G; tasks in the same
batch ran in parallel (disjoint files, no dependency on each other's output). T4.9/T4.10 and the
U2a/e2e fixes were found and fixed during G4 gate prep and the gate itself, after all Batch A-G
tasks were already done.

| ID | Task | Agent | Depends | Batch | Status | Attempts | Commit |
|---|---|---|---|---|---|---|---|
| T4.1 | Trends and usage metrics (TREND-1 to 5) | analytics-engineer | G3 | A | Done | 1 | ad3b10a |
| T4.2a | Waiver candidate pool, prefilter, Lineup Impact (WAIVER-1, 2) | analytics-engineer | G3 | A | Done | 1 | b94c236 |
| T4.3 | Production Docker image beta (HOST-1 to 6 partial) | devops-engineer | G3 | A | Done | 2 | 7711881, 91a616c |
| T4.2b | Waiver Score composite, two views (WAIVER-3, 4) | analytics-engineer | T4.2a | B | Done | 1 | 63b415a |
| T4.4 | Waiver priority advisor (WAIVER-6a to 6d) | analytics-engineer | T4.2a | B | Done | 1 | a6ba38c |
| T4.8a | Reason contract amendment (Lineup "why" detail, Steph's G3 ask) | backend-engineer | none | B | Done | 1 | 6384643 |
| T4.5a | `packages/db` read helpers: usage, trending, positional ranking, rostered-id set | backend-engineer | T4.1, T4.2a | C | Done | 1 | 8cb05e0, f2f8e8a |
| T4.8b | Populate Reason field, rewrite reason-code copy to plain language | analytics-engineer | T4.8a | C | Done | 1 | f97a16e |
| T4.5b | Waivers data function, API route, response DTOs | backend-engineer | T4.5a, T4.2b, T4.4 | D | Done | 2 | ee08fc4, 68eb1b5 |
| T4.5c | Players list and detail data functions, API routes, response DTOs | backend-engineer | T4.5a, T4.1 | D | Done | 1 | f75d318 |
| T4.6a | Waivers page | frontend-engineer | T4.4, T4.5b | E | Done | 2 | 64af436, 0e71028 |
| T4.6b | Players explorer and player detail | frontend-engineer | T4.5c | E | Done | 2 | 1e9a764, 7e3a30a |
| T4.8c | Render `projectedPoints` in the Lineup "why" UI | frontend-engineer | T4.8b | E | Done | 2 | 1415d02, 0e71028 |
| T4.6c | Home waiver-targets and risers cards | frontend-engineer | T4.6a, T4.6b | F | Done | 2 | 6fa47dc, 27d67a2 |
| T4.7 | Tests: waiver scenarios, priority advisor golden scenarios, perf, e2e | qa-engineer | T4.6a, T4.6b, T4.6c | G | Done | 1 | eae6fab |
| T4.9 | Fix WAIVER-6d DST bug in `computeNextWaiverClear` (found live by the orchestrator against Steph's real league settings) | analytics-engineer | gate prep | gate | Done | 1 | 624771b |
| T4.10 | Docker beta soak-test script, `pnpm gate:soak [--minutes=N]` | devops-engineer | gate prep | gate | Done | 1 | f6a8093 |

## Phase 4 live fixes (Steph's hands-on testing, before the G4 gate)

Steph ran the implementation locally (`pnpm dev:lan`, real synced league data) and found 5 real issues; all fixed and committed, not tied to a task ID:

| Issue | Fix | Commit |
|---|---|---|
| Reason chip text cut off mid-word on mobile Lineup (`"Questionable, so we lo..."`) | `ReasonChip` wraps (`break-words`) instead of truncating | `28a19f1` |
| Waiver auto-drop suggested her only DEF, which would leave the starting DEF slot empty | Auto-drop now checks (via the existing Hungarian solver, reused as a feasibility check) that every required slot stays fillable before suggesting a drop; falls back to the old behavior only when the roster is already short-staffed independent of the drop | `010a8b6` |
| "Why?"/"Competing" buttons did nothing on her phone | Root cause: the dev server was started with plain `next dev` instead of `pnpm dev:lan`, so `SIDELINE_DEV_ORIGINS` was unset and Next.js silently blocked HMR for her phone's LAN-IP origin. Not a code bug -- always use `pnpm dev:lan` for phone testing | none (dev workflow only) |
| Waiver Score breakdown showed raw unrounded floats (`94.5945945945946`) | `formatReasonValue` rounds numbers to 1 decimal in `ReasonChip`/`WhyBody`; strings pass through | `10cd72e` |
| Lineup's Optimal column duplicated reason detail inline on every row, on top of the "Why?" sheet | Inline `ReasonChips` removed from `slot-column.tsx`; only the "Why?" trigger remains | `10cd72e` |

## Phase 4 gate-time fixes (found during G4 prep and the gate itself)

| Issue | Fix | Commit |
|---|---|---|
| WAIVER-6d `computeNextWaiverClear` approximated America/New_York with a fixed UTC-5 offset, wrong by exactly 1 hour during EDT (mid-March to early November, most of the NFL season). Found live by the orchestrator checking against Steph's real league settings (`waiver_day_of_week=2`, `waiver_clear_days=2`): 2026-10-03 (EDT) computed a clear time that displayed as 4:00 AM ET against a "3:00 ET" label. | Resolves the real DST-aware offset per-instant with the same `Intl.DateTimeFormat` technique `packages/providers/src/schedule.ts` already uses for kickoff times, reimplemented locally in `packages/core` (no new cross-package dependency). `etUtcOffsetHours` is now `@deprecated` and ignored. Includes a 2-line orchestrator fix to a golden test that hardcoded the same wrong offset for a January/EST case. | `624771b` [T4.9] |
| No script existed to run the G4 phase check "beta image runs against live data for 30 minutes with healthy sync runs". | `pnpm gate:soak [--minutes=N]`, reusable for Phase 6's 60-minute soak too. Real 30-minute run: 15/15 sync runs succeeded, zero failures, zero stuck rows. | `f6a8093` [T4.10] |
| `pnpm gate`'s coverage-instrumented run (U2a) failed deterministically: V8 coverage instrumentation inflated WAIVER-2's 450-Hungarian-solve perf test from ~266ms (real) to 2000-3800ms, blowing its own margin and the real spec budget. Test-tooling artifact, not a production regression (7.5x real margin). | Excluded `*.perf.test.ts` from `--coverage` runs only; `pnpm verify`/`test:unit` still run them for real. Confirmed no coverage-threshold regression. | `974f380` |
| `e2e/pages.spec.ts`'s STATE-2/STATE-3 still asserted Waivers and Players render as stub placeholders, stale since T4.6a/T4.6b shipped real pages. | Scoped the stub-page assertion to Matchup, the only section still a stub. Found and fixed by qa-engineer's own gate run. | `974f380` |

**G4 phase checks:** all P0 WAIVER (1-4, 6a-6d) and TREND (1-5) requirements traced to tests;
WAIVER-6d clear time verified live against Steph's real league settings (found and fixed T4.9's
DST bug); perf budgets met (WAIVER-2 ~266ms vs 2000ms spec, 7.5x margin); beta image ran against
live data for 30 minutes with healthy sync runs (15/15 succeeded, zero failures). Full gate
report: `docs/gates/G4.md`, PASS. Code review: `docs/reviews/2026-10-03-G4-code.md`, zero
Blocker/Major. UX review: `docs/reviews/2026-10-03-G4-ux.md`, zero Blocker/Major.
