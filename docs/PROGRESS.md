# Progress

## Phase status

| Phase | Gate | Branch | Status |
|---|---|---|---|
| 0 Bootstrap and API spike | G0 | `phase/0-bootstrap` (merged) | Done, G0 PASS 2026-10-01 |
| 1 Data layer and sync | G1 | `phase/1-data` | In progress (plan approved 2026-10-02, ADR-005) |
| 2 App shell and league views | G2 (human) | | Not started |
| 3 Scoring, projections, optimizer | G3 (human) | | Not started |
| 4 Waivers, players, Docker beta | G4 (human, optional) | | Not started |
| 5 Matchups and league intelligence | G5 | | Not started |
| 6 Hardening and v1.0 | G6 (human) | | Not started |

## Resume point (read this first after /clear or a new session)

Updated: 2026-10-02, after commit f759d28 (T1.4b). The orchestrator rewrites this section after every commit.

- **Branch:** `phase/1-data`. Plan: ADR-005 (approved by Steph with changes); nflverse facts: ADR-006. Phase 1 task table below.
- **Committed and verified:**
  - B0, T1.0, T1.1 (plus fix), T1.2a (plus fix), T1.4a, T1.3a, T1.2b, T1.4b.
  - Batch A and B work is done.
  - Reviews saved: `docs/reviews/2026-10-02-p1-batchA-part1-code.md` and `-part2-code.md`.
- **In flight:** the code review of Batch B (code-reviewer, read-only, diff `37f1bde..f759d28` covering T1.3a, T1.2b and T1.4b), to be saved as `docs/reviews/2026-10-02-p1-batchB-code.md`. If interrupted, re-run it; nothing to clean up.
- **Next steps, in order:**
  1. Save the Batch B review. Fix Blocker and Major findings (send each back to the owning agent with a narrowed brief); Minor findings go to the backlog.
  2. Batch C, three in parallel:
     - T1.3b (backend-engineer, `packages/db`): idempotent upserts counting real changes only; projection snapshot upsert (only when fetched_at is before kickoff); `http_cache` EtagStore; `computed_cache`; read helpers for health and sync status.
     - T1.5a (sleeper-data-engineer, `apps/worker`):
       - croner scheduler with PLAN 3.1 cadences and `SYNC_*_CRON` overrides;
       - job runner writing `sync_runs` that never crashes the process;
       - heartbeat and the `sync_requests` poller;
       - game windows from the `schedule` table with the ADR-002 fallback;
       - the `pnpm run sync --once [--job]` CLI: it enqueues to a live worker and waits, runs directly when no worker is alive, and holds the renewed lease (ADR-005 item 3);
       - one shared `RateLimiter`.
     - T1.6 (backend-engineer, `apps/web/app/api` plus `apps/web/lib/server`): health per ADR-005 item 6 (update the existing route test), sync status, `POST /api/sync/run` (queues a request, dedupes, at most 1 per job per 60 s, else 429 with Retry-After); thin handlers; temp-SQLite tests.
  3. Batches D (T1.5b, T1.7a, T1.8), E (T1.5c), F (T1.7b), then the G1 gate, per the task table, ADR-005 and the backlog notes tagged T1.5b, T1.7a and T1.8.
- **Every brief carries:**
  - the Node 24 PATH prefix;
  - identifiers only from `.env` (ADR-000);
  - msw 3;
  - no `.skip` and no weakened thresholds;
  - only devops changes dependencies (ADR-005 item 15);
  - report, don't fix, failures in other agents' paths;
  - `pnpm run sync`, not `pnpm sync`;
  - work efficiently and keep the report short (Steph's token budget is limited).
- **Before every commit:**
  - `pnpm verify`;
  - an identifier scan of the staged diff against `.env`;
  - `pnpm fixtures:check` when fixtures change;
  - rewrite this Resume point and commit it.

## Phase 0 tasks

| ID | Title | Agent | Batch | Status | Attempts | Commit |
|---|---|---|---|---|---|---|
| T0.0 | Toolchain, branch, tracking docs, ADR-000/003, PLAN amendments | orchestrator | 0 | Done | 1 | f7345f1 |
| T0.1 | Workspace scaffold and tooling | devops-engineer | A | Done | 1 | a6e3f2c |
| T0.2 | Next.js skeleton, /api/health, Dockerfile | devops-engineer | B | Done (review fixes) | 2 | a21579d, 36934fd |
| T0.3a | Sleeper API spike and api-notes | sleeper-data-engineer | B | Done | 1 | 6c89e16 |
| T0.4 | Test harness (MSW, Playwright, axe, LHCI) | qa-engineer | B | Done (review fixes) | 2 | b5e50ad, 3308ac3 |
| T0.3b | Fixture recorder and sanitized fixtures | sleeper-data-engineer | C | Done | 2 (attempt 1 leaked real ids into test-data.ts, caught by orchestrator scan before commit) | d47388e, 7c0ff9f |
| T0.5 | gate and screens scripts, CI | devops-engineer | C | Done (2.1k lines, over the 400-line guideline; accepted, mostly helpers and tests) | 1 | 7326537 |
| T0.6 | ADR-001, ADR-002, PLAN amendments | orchestrator | D | Done | 1 | 0292fe2 |
| T0.5-fix | Batch C review fixes (M1, m1-m5, m7, m11, n1, n3) | devops-engineer | C-fix | Done (restarted once after a usage-limit interruption) | 1 | 4471a14 |
| T0.3b-fix | Batch C review fixes (m8-m10, m12) | sleeper-data-engineer | C-fix | Done (restarted once after the same interruption) | 1 | 5f4a760 |
| G0 | Gate | qa-engineer, code-reviewer, orchestrator | E | PASS | 1 | see `docs/gates/G0.md`, tag `gate-G0` |

## Phase 1 tasks

| ID | Title | Agent | Batch | Status | Attempts | Commit |
|---|---|---|---|---|---|---|
| T1.B0 | Branch, ADR-005, PLAN amendments, coverage config | orchestrator | 0 | Done | 1 | e4330e4 |
| T1.0 | Dependency preinstall, workspace links, script wiring, next.config | devops-engineer | A0 | Done | 1 | b0cf521 |
| T1.1 | Shared domain types, DTOs, env config | backend-engineer | A | Done | 1 | 4aa4207 |
| T1.2a | Sleeper HTTP core (limiter, retries, errors, ETag) | sleeper-data-engineer | A | Done | 1 | aab3c0c |
| T1.1-fix | Review fixes m6-m9 (cron, TZ, transaction fields, timestamp note) | backend-engineer | A-fix | Done | 1 | 133ebef |
| T1.2a-fix | Review fixes m1-m3, m5, n1 (Retry-After cap, body cancel, monotonic limiter, timer injection) | sleeper-data-engineer | A-fix | Done | 1 | fa96fab |
| T1.4a | nflverse spike and fixture recorder | sleeper-data-engineer | A | Done | 1 | d5b2200 |
| T1.2b | Sleeper endpoints, schemas, real-row filters, mappers | sleeper-data-engineer | B | Done (agent hit the session limit after finishing; orchestrator verified; 712 non-test lines, mostly schemas, accepted) | 1 | 38ee8a4 |
| T1.3a | DB schema, migrations, sync/heartbeat/request/lease helpers | backend-engineer | B | Done | 1 | 195826e |
| T1.4b | nflverse provider | sleeper-data-engineer | B | Done (attempt 1 stopped at pause before writing; attempt 2 delivered; 693 non-test lines across 7 files, accepted) | 2 | f759d28 |
| T1.3b | DB upserts, snapshots, ETag store, computed_cache | backend-engineer | C | Not started | 0 | |
| T1.5a | Worker framework, CLI, lease, game windows | sleeper-data-engineer | C | Not started | 0 | |
| T1.6 | Health, sync status, sync run API | backend-engineer | C | Not started | 0 | |
| T1.5b | Sleeper sync jobs and 2025 backfill | sleeper-data-engineer | D | Not started | 0 | |
| T1.7a | Integration and contract harness | qa-engineer | D | Not started | 0 | |
| T1.8 | Docker and build with SQLite | devops-engineer | D | Not started | 0 | |
| T1.5c | nflverse job, derived hook, db:seed:fixtures | sleeper-data-engineer | E | Not started | 0 | |
| T1.7b | Integration suites | qa-engineer | F | Not started | 0 | |
| G1 | Gate | qa-engineer, code-reviewer, orchestrator | G | Not started | 0 | |

Plan: ADR-005. Approved changes: single caller enforced (CLI enqueues to a live worker; renewed DB lease), projection real-row rule documented per endpoint with a week 5 non-empty test and bye handling via schedule, red-zone touches dropped to P1 if they need play-by-play.

## Standing rules for briefs

- Real identifiers (username, league id, league name, user ids, manager and team names) are read from `.env` and never written to tracked files (ADR-000).
- Partial weeks (in progress at recording time) are excluded from SCORE-2 validation and golden expectations (ADR-000 item 9). Phase 3 briefs must restate this.
- Agents use Node 24: prefix shell commands with `export PATH="$HOME/.local/share/fnm/node-versions/v24.21.0/installation/bin:$PATH"` (the tool shell defaults to Node 25).

## Backlog (Minor findings and follow-ups)

- T1.0 (was T1.3): add `better-sqlite3: true` under `allowBuilds` in pnpm-workspace.yaml (pnpm 12 blocks native builds by default).
- T4.3: revisit health semantics once the supervisor exists; a worker heartbeat stale beyond a threshold should probably fail the Docker healthcheck (ADR-005 item 6).
- ADR-001: TypeScript pinned to 6.0.3 (not 7.x) because typescript-eslint 8.71 requires `<6.1`. Revisit when typescript-eslint supports TS 7.
- Image size: the gate measures `docker image inspect` Size (93.3 MB arm64, 93.2 MB amd64 for web alone; HOST-5 limit 400 MB). OrbStack's "disk usage" column (about 400 MB) is not the measure.
- Route JS headroom: the placeholder page already ships about 132 KB of 200 KB gzipped script. Frontend briefs (T2.1+) must lazy-load charts and watch bundle size.
- Lighthouse best-practices is 0.96 against a 0.95 floor on the placeholder page.
- Review m4: resolved in ADR-005 item 8 (api and worker at 75% lines).
- Playwright `--project` is variadic: put the spec path before `--project`.
- tests/fixtures/README.md should list the extra manifest keys the recorder writes (currentWeek, futureMatchupWeeks, projectionWeeks, statsWeeks, syntheticLeagueId, sanitizerVersion, trimming). Owner: qa-engineer.
- `pnpm fixtures:check` needs the gitignored raw cache or live API, so it cannot run in CI. The orchestrator runs it plus an independent live-fetched identifier scan before every commit and at every gate.
- Fixtures are 5.6 MB (target under 6 MB): little headroom for re-recording more weeks; re-record with trimming rather than growing.
- G0 review N1: `pnpm gate --only=...` overwrites `docs/gates/latest.json`; write partial runs to `latest.partial.json`. Owner: devops-engineer.
- G0 review N3: `reuseExistingServer: !CI` in playwright.config.ts can reuse a stale local server. Owner: qa-engineer.
- G0 review N4: UI3 should wait for port 3000 to be released after stopping the shared server. Owner: devops-engineer.
- G0 review n1 and Batch C n2: document the Lighthouse script-size unit; update tests/fixtures/README.md fake id ranges, manifest keys and the short-name word-boundary rule. Owner: qa-engineer.
- T1.0: pnpm prints a peer-dependency warning on install (not investigated). @types/better-sqlite3 9.6.0 may lag the v13 API. Worker stub scripts use root tsx; add tsx to the worker when real scripts land. Owner: devops-engineer (T1.8).
- Per-project coverage (`vitest run --coverage --project X`) prints Unknown% because coverage globs are repo-relative; use the whole-repo run. Owner: qa-engineer (T1.7a).
- T1.2b/T1.5b: pass a `Sideline/<version> (self-hosted)` user agent; `/players/nfl` calls pass `{ etag: false }`; the worker shares one `RateLimiter`.
- P1: nflverse play-by-play for red-zone touches (TREND-2), ADR-006 item 6.
- T1.8 (devops): declare zod and tsx in packages/db (imported/used but resolved via root hoisting); bundle `packages/db/drizzle/` migrations into the image or set `SIDELINE_MIGRATIONS_DIR`. `cli/migrate.ts` has no unit test (covered by the CLI run; db total 91.6%).
- T1.4a review m6/m8 (sleeper-data-engineer): nflverse recorder `--refresh`, size check, fetch timeout, zod for release JSON, root from import.meta.url, write-then-swap; label 14f join rates as spike measurements or add `--report`.
- T1.5c: compute the ADR-002 fallback kickoff when nflverse gametime is missing (provider returns kickoffUtc null, kickoffApproximate true); pass PlayerRef.gsisId as stored. getUsage re-parses cached files each call (fine at this size).
- msw is 3.0.1; @vitest/mocker lists an optional msw ^2 peer (browser mode only, unused). Briefs using MSW must point agents at msw 3 APIs.

## Questions for Steph

- None open. PLAN.md section 13 answered on 2026-10-01.
