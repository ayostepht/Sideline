# Progress

## Phase status

| Phase | Gate | Branch | Status |
|---|---|---|---|
| 0 Bootstrap and API spike | G0 | `phase/0-bootstrap` (merged) | Done, G0 PASS 2026-10-01 |
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
| T0.4 | Test harness (MSW, Playwright, axe, LHCI) | qa-engineer | B | Done (review fixes) | 2 | b5e50ad, 3308ac3 |
| T0.3b | Fixture recorder and sanitized fixtures | sleeper-data-engineer | C | Done | 2 (attempt 1 leaked real ids into test-data.ts, caught by orchestrator scan before commit) | d47388e, 7c0ff9f |
| T0.5 | gate and screens scripts, CI | devops-engineer | C | Done (2.1k lines, over the 400-line guideline; accepted, mostly helpers and tests) | 1 | 7326537 |
| T0.6 | ADR-001, ADR-002, PLAN amendments | orchestrator | D | Done | 1 | 0292fe2 |
| T0.5-fix | Batch C review fixes (M1, m1-m5, m7, m11, n1, n3) | devops-engineer | C-fix | Done (restarted once after a usage-limit interruption) | 1 | 4471a14 |
| T0.3b-fix | Batch C review fixes (m8-m10, m12) | sleeper-data-engineer | C-fix | Done (restarted once after the same interruption) | 1 | 5f4a760 |
| G0 | Gate | qa-engineer, code-reviewer, orchestrator | E | PASS | 1 | see `docs/gates/G0.md`, tag `gate-G0` |

## Standing rules for briefs

- Real identifiers (username, league id, league name, user ids, manager and team names) are read from `.env` and never written to tracked files (ADR-000).
- Partial weeks (in progress at recording time) are excluded from SCORE-2 validation and golden expectations (ADR-000 item 9). Phase 3 briefs must restate this.
- Agents use Node 24: prefix shell commands with `export PATH="$HOME/.local/share/fnm/node-versions/v24.21.0/installation/bin:$PATH"` (the tool shell defaults to Node 25).

## Backlog (Minor findings and follow-ups)

- T1.3: add `better-sqlite3: true` under `allowBuilds` in pnpm-workspace.yaml (pnpm 12 blocks native builds by default).
- ADR-001: TypeScript pinned to 6.0.3 (not 7.x) because typescript-eslint 8.71 requires `<6.1`. Revisit when typescript-eslint supports TS 7.
- Image size: the gate measures `docker image inspect` Size (93.3 MB arm64, 93.2 MB amd64 for web alone; HOST-5 limit 400 MB). OrbStack's "disk usage" column (about 400 MB) is not the measure.
- Route JS headroom: the placeholder page already ships about 132 KB of 200 KB gzipped script. Frontend briefs (T2.1+) must lazy-load charts and watch bundle size.
- Lighthouse best-practices is 0.96 against a 0.95 floor on the placeholder page.
- Review m4: coverage does not measure `apps/web/app/api/**`. Decide in the T1.6 brief (keep handlers thin and test via lib/server, or add api to the 75% group).
- Playwright `--project` is variadic: put the spec path before `--project`.
- tests/fixtures/README.md should list the extra manifest keys the recorder writes (currentWeek, futureMatchupWeeks, projectionWeeks, statsWeeks, syntheticLeagueId, sanitizerVersion, trimming). Owner: qa-engineer.
- `pnpm fixtures:check` needs the gitignored raw cache or live API, so it cannot run in CI. The orchestrator runs it plus an independent live-fetched identifier scan before every commit and at every gate.
- Fixtures are 5.6 MB (target under 6 MB): little headroom for re-recording more weeks; re-record with trimming rather than growing.
- G0 review N1: `pnpm gate --only=...` overwrites `docs/gates/latest.json`; write partial runs to `latest.partial.json`. Owner: devops-engineer.
- G0 review N3: `reuseExistingServer: !CI` in playwright.config.ts can reuse a stale local server. Owner: qa-engineer.
- G0 review N4: UI3 should wait for port 3000 to be released after stopping the shared server. Owner: devops-engineer.
- G0 review n1 and Batch C n2: document the Lighthouse script-size unit; update tests/fixtures/README.md fake id ranges, manifest keys and the short-name word-boundary rule. Owner: qa-engineer.
- msw is 3.0.1; @vitest/mocker lists an optional msw ^2 peer (browser mode only, unused). Briefs using MSW must point agents at msw 3 APIs.

## Questions for Steph

- None open. PLAN.md section 13 answered on 2026-10-01.
