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
| T0.0 | Toolchain, branch, tracking docs, ADR-000/003, PLAN amendments | orchestrator | 0 | Done | 1 | (this commit) |
| T0.1 | Workspace scaffold and tooling | devops-engineer | A | Todo | 0 | |
| T0.2 | Next.js skeleton, /api/health, Dockerfile | devops-engineer | B | Todo | 0 | |
| T0.3a | Sleeper API spike and api-notes | sleeper-data-engineer | B | Todo | 0 | |
| T0.4 | Test harness (MSW, Playwright, axe, LHCI) | qa-engineer | B | Todo | 0 | |
| T0.3b | Fixture recorder and sanitized fixtures | sleeper-data-engineer | C | Todo | 0 | |
| T0.5 | gate and screens scripts, CI | devops-engineer | C | Todo | 0 | |
| T0.6 | ADR-001, ADR-002, PLAN amendments | orchestrator | D | Todo | 0 | |
| G0 | Gate | qa-engineer, code-reviewer, orchestrator | E | Todo | 0 | |

## Standing rules for briefs

- Real identifiers (username, league id, league name, user ids, manager and team names) are read from `.env` and never written to tracked files (ADR-000).
- Partial weeks (in progress at recording time) are excluded from SCORE-2 validation and golden expectations (ADR-000 item 9). Phase 3 briefs must restate this.
- Agents use Node 24: prefix shell commands with `export PATH="$HOME/.local/share/fnm/node-versions/v24.21.0/installation/bin:$PATH"` (the tool shell defaults to Node 25).

## Backlog (Minor findings and follow-ups)

- (none yet)

## Questions for Steph

- None open. PLAN.md section 13 answered on 2026-10-01.
