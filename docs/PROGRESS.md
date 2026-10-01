# Progress

## Phase status

| Phase | Gate | Branch | Status |
|---|---|---|---|
| 0 Bootstrap and API spike | G0 | `phase/0-bootstrap` | In progress |
| 1 Data layer and sync | G1 | | Not started |
| 2 App shell and league views | G2 (human) | | Not started |
| 3 Scoring, projections, optimizer | G3 (human) | | Not started |
| 4 Waivers, players, Docker beta | G4 (human, optional) | | Not started |
| 5 Matchups and league intelligence | G5 | | Not started |
| 6 Hardening and v1.0 | G6 (human) | | Not started |

## Phase 0 tasks

| ID | Title | Agent | Batch | Status | Attempts | Commit |
|---|---|---|---|---|---|---|
| T0.0 | Toolchain, branch, tracking docs, ADR-000/003, PLAN amendments | orchestrator | 0 | Done | 1 | f7345f1 |
| T0.1 | Workspace scaffold and tooling | devops-engineer | A | Done | 1 | a6e3f2c |
| T0.2 | Next.js skeleton, /api/health, Dockerfile | devops-engineer | B | Done (review fixes) | 2 | a21579d, 36934fd |
| T0.3a | Sleeper API spike and api-notes | sleeper-data-engineer | B | Done | 1 | 6c89e16 |
| T0.4 | Test harness (MSW, Playwright, axe, LHCI) | qa-engineer | B | Done (review fixes) | 2 | b5e50ad, (this commit) |
| T0.3b | Fixture recorder and sanitized fixtures | sleeper-data-engineer | C | Todo | 0 | |
| T0.5 | gate and screens scripts, CI | devops-engineer | C | Todo | 0 | |
| T0.6 | ADR-001, ADR-002, PLAN amendments | orchestrator | D | Todo | 0 | |
| G0 | Gate | qa-engineer, code-reviewer, orchestrator | E | Todo | 0 | |

## Standing rules for briefs

- Real identifiers (username, league id, league name, user ids, manager and team names) are read from `.env` and never written to tracked files (ADR-000).
- Partial weeks (in progress at recording time) are excluded from SCORE-2 validation and golden expectations (ADR-000 item 9). Phase 3 briefs must restate this.
- Agents use Node 24: prefix shell commands with `export PATH="$HOME/.local/share/fnm/node-versions/v24.21.0/installation/bin:$PATH"` (the tool shell defaults to Node 25).

## Backlog (Minor findings and follow-ups)

- T1.3: add `better-sqlite3: true` under `allowBuilds` in pnpm-workspace.yaml (pnpm 12 blocks native builds by default).
- ADR-001: TypeScript pinned to 6.0.3 (not 7.x) because typescript-eslint 8.71 requires `<6.1`. Revisit when typescript-eslint supports TS 7.
- Docker image reports about 400 MB in OrbStack "disk usage" (93 MB compressed, about 290 MB unpacked) for web alone. HOST-5 limit is 400 MB. T4.3 must define the measurement (`docker image inspect` Size) and slim the runtime stage before adding the worker.
- Route JS headroom: the placeholder page already ships about 132 KB of 200 KB gzipped script. Frontend briefs (T2.1+) must lazy-load charts and watch bundle size.
- Lighthouse best-practices is 0.96 against a 0.95 floor on the placeholder page.
- Review m4: coverage does not measure `apps/web/app/api/**`. Decide in the T1.6 brief (keep handlers thin and test via lib/server, or add api to the 75% group).
- Playwright `--project` is variadic: put the spec path before `--project`.
- msw is 3.0.1; @vitest/mocker lists an optional msw ^2 peer (browser mode only, unused). Briefs using MSW must point agents at msw 3 APIs.

## Questions for Steph

- None open. PLAN.md section 13 answered on 2026-10-01.
