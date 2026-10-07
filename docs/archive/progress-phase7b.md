# Phase 7b archive (Auto lineup, trades, weather)

Released v1.3.0 on 2026-10-07 (merge `7e8e79b`, tags `v1.3.0`, `gate-G7b`). Gate report: `docs/gates/G7b.md`.

## Phase 7b task table (ADR-022)

Batches run in order; tasks inside a batch are file-disjoint. Contracts (P7b.1) land first.

| ID | Title | Agent | Batch | Depends on | Reqs | Status | Attempts | Commit |
|---|---|---|---|---|---|---|---|---|
| P7b.1 | Shared contracts: `LineupModeChoice` (adds `auto`), `resolvedMode`/`modeReason` plus server shim; trade evaluate/finder DTOs; weather DTO and `weatherFlags` | backend-engineer | 1 | none | AUTO-1, TRADE-1..5, WX-3, WX-4 | Done | 1 | 7f5ac4c |
| P7b.2 | DB: migration 0005 `game_weather` table and `schedule.stadium_id`, upsert and read helpers; `weather` sync job name and 3 h cadence in `shared/sync.ts` (orchestrator adds the worker `JOB_TABLES` entry as an integration fix) | backend-engineer | 2 | P7b.1 | WX-3 | Done (job name deferred to P7b.6) | 1 | 6be1eda |
| P7b.3 | Core `trade/`: evaluate (multi-player swap, drop rule, ROS lineup delta), fairness label, finder enumeration and prefilter, perf tests | analytics-engineer | 2 | P7b.1 | TRADE-1..4 | Done | 1 | a3ea5e5 |
| P7b.4 | Providers: Open-Meteo client (zod), static stadium table, flag thresholds, recorded fixture | sleeper-data-engineer | 2 | P7b.1 | WX-1, WX-2, WX-4 | Done | 1 | cffc00f |
| P7b.5 | Server: Auto mode in `getLineup` (reads `getMatchup`), default mode, Home card follows | backend-engineer | 3 | P7b.1 | AUTO-1 | Done | 1 | 24a8b72 |
| P7b.6 | Worker: `weather` job (outdoor/open games next 7 days, every 3 h, degrades); orchestrator pre-applies the parked job-name patch (`shared/sync.ts` name and cadence, contracts test count, `JOB_TABLES`) | sleeper-data-engineer | 3 | P7b.2, P7b.4 | WX-1, WX-3 | Done | 1 | 3b6118c |
| P7b.7 | Server: trade data functions and API routes (evaluate, finder, same-seed playoff deltas, export ROS values from roster-strength) | backend-engineer | 3 | P7b.3 | TRADE-1..4 | Done | 1 | 830f9d6 |
| P7b.8 | UI: Auto in the mode toggle (fixes review m3: toggle must show Auto selected), Home card requests `auto`, "Auto picked ..." reason | frontend-engineer | 4 | P7b.5 | AUTO-1 | Done | 1 | 0ef710b |
| P7b.7f | Batch 3 review fixes: trade reason labels use names (M1), honest top-10 playoff reason (M2), hashes add leagues/players (m1), cached baseline sim (m2), `lineup-inputs.ts` breaks the import cycle (m3) | backend-engineer | 4 | P7b.7 | TRADE-1..4 | Done | 1 | b67cca6 |
| P7b.6f | Open-Meteo HTTP 400 counts as a failure, not out of range (m4) | sleeper-data-engineer | 4 | P7b.6 | WX-1 | Done | 1 | 58c64ac |
| P7b.9 | Server: weather reads joined into lineup reasons, next-opponents and matchup data; review m1 (`keepIfNull: ["stadium_id"]` in the SCHEDULE upsert spec) | backend-engineer | 4 | P7b.2, P7b.6 | WX-4, WX-5 | Done | 1 | 571ba04 |
| P7b.10 | UI: Trades route and nav item (Analyzer and Finder tabs, mobile More sheet) | frontend-engineer | 4 | P7b.7 | TRADE-3..5 | Done | 1 | 8fc0ddb |
| P7b.3f | Finder: exclude Lopsided, rank by the smaller gain (ADR-022 7a, UX M1); surplus-position give pool (m4); dedupe perf assertion (m5) | analytics-engineer | 4c | P7b.3 | TRADE-2, TRADE-4 | Done | 1 | 2f594b5 |
| P7b.7g | Trades cold-load: measure and fix the server path; batched roster read (UX M3, code m4) | backend-engineer | 4c | P7b.7f | TRADE-4 | Done | 1 | 5e8d30b |
| P7b.10f | Trades and Auto UX fixes: touch popovers, 44px targets, Suspense streaming, before/after grid, selection chips, card actions (UX M1-M3, m1-m4; code m5, n1) | frontend-engineer | 4c | P7b.10 | TRADE-3..5, AUTO-1 | Done | 1 | 552d802 |
| P7b.11 | UI: weather chips on Lineup, player card Next opponents, Matchup | frontend-engineer | 5 | P7b.9 | WX-4, WX-5 | Done (visuals verified on gallery only) | 1 | bf3a290 |
| P7b.13 | Screens route list adds Trades; `fixtures:check` applies the ADR-018 URL exemption and handles binary false positives | devops-engineer | 5 | none | tooling | Done (routes by devops; checker by sleeper-data as P7b.13b) | 1 | 43e8f14, b0f67ad |
| P7b.3g | Finder variety: at most 2 suggestions per give set and per get set (UX re-check m4) | analytics-engineer | 5 | P7b.3f | TRADE-2 | Done | 1 | 07c6b36 |
| P7b.9f | Weather not rendering on fixture data: root cause, fix and regression test | backend-engineer | 5 | P7b.9, P7b.11 | WX-4, WX-5 | Done (no server bug; stale build plus unpinned screens clock) | 1 | 188e6fe |
| P7b.14 | Players detail route over the hard JS cap (220,112 B vs 204,800 B, was 193,914 B at G4) | frontend-engineer | 5 | none | PLAN 6.6 budgets | Done | 1 | a6eb37c |
| P7b.13c | `pnpm screens` pins the game clock like e2e and refuses stale builds | devops-engineer | 5 | none | tooling | Done | 1 | 5c9bcf3 |
| P7b.10g | Trades soft-navigation title lost (WCAG 2.4.2, TRADE-2b); LINEUP-FLOW-4 mobile-pixel blank not-found flake (3/10) | frontend-engineer | 5 | P7b.13d | Leak-check URL exemption matches only the exact handle segment (Batch 5 review M1) | sleeper-data-engineer | 5 | P7b.13b | privacy | Done | 1 | ac0aa42 |
| P7b.14f | Lazy-load robustness (review M2, M3, m1, m2) and the LINEUP-FLOW-4 blank 404 regression from a6eb37c | frontend-engineer | 5 | P7b.14 | UI1, UI2 | Done (eager WhySheet on Lineup; FLOW-4 200/200) | 1 | f86f84b |
| P7b.12 | TRADE-5, UI2 | Done (title); FLOW-4 bisected to a6eb37c, moved to P7b.14f | 1 | 33767f1 |
| P7b.12 | QA: e2e and a11y for Auto, Trades, weather; fixture DB weather rows | qa-engineer | 5 | P7b.8, P7b.10 (P7b.11 for weather specs) | all | Done (531 passed; TRADE-2b red pending P7b.10g) | 1 | af9c331 |

After each batch: code-reviewer (and ux-reviewer for UI batches 4 and 5). One combined mini-gate for Auto, Trades and weather after batch 5 (changed 2026-10-07 to save tokens; the e2e for all three land in P7b.12). Release v1.3.0.

