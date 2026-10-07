# Phase 7a: player card (ADR-020)

Merged to `main` 2026-10-06 (`b153b3d`), released as v1.1.0. Reviews: `docs/reviews/2026-10-06-p7-*`.

## Task table

| ID | Title | Agent | Batch | Status | Attempts | Commit |
|---|---|---|---|---|---|---|
| P7.1 | DB: players.espn_id, player_news table, helpers, news sync job + on-demand target | backend-engineer | A | Done | 1 | 30e45e4 |
| P7.2 | ESPN news provider client (zod, fixture, limiter) | sleeper-data-engineer | A | Done | 1 | e4fa039 |
| P7.3 | Pop-up via intercepting route, clickable names app-wide, team subline | frontend-engineer | A | Done | 1 | 5080504 |
| P7.4 | DTO (weekly rows, headshot, news) + getPlayerDetail + CSP | backend-engineer | B | Done | 1 | f6368c2 |
| P7.5 | Persist espn_id; news worker job (scheduled + on-demand) | sleeper-data-engineer | B | Done | 1 | 1e9fa59 |
| P7.5b | Review fixes: ESPN circuit breaker (M1), entity decode, attribution, dup espn ids | sleeper-data-engineer | B | Done | 1 | 259506e |
| P7.6a | Player card: headshot, weekly table, news, refresh on open | frontend-engineer | C | Done | 1 | 0c04c89 |
| P7.6b | Search opens pop-up, team on swing/riser rows, review m5/m6, header title | frontend-engineer | C | Done | 1 | 08c76f6 |
| P7.8a | Review M1/m1: news fetch-attempt marker, count helper in db | backend-engineer | D | Done | 1 | c74522d |
| P7.8b | Worker records news fetch attempts | sleeper-data-engineer | D | Done | 1 | 4aac7d0 |
| P7.8c | Code review M3/m2/m5/n1 + UX M1-M4/m1/m2/m4/n1 + nav highlight in pop-up | frontend-engineer | D | Done | 1 | 2a0b262 |
| P7.8d | Fix intermittent focus return on Escape (PLAYERCARD-3) | frontend-engineer | E | Done | 1 | 3ee5490 |
| P7.9 | e2e: Back/Forward, second player from pop-up, leave via link in pop-up (re-review M1) | qa-engineer | F | Done | 1 | cada111 |
| P7.10 | Focus to main when leaving an open pop-up by soft navigation (PLAYERCARD-19) | frontend-engineer | F | Done | 1 | e036945 |
| P7.7 | e2e + a11y for pop-up and player card | qa-engineer | C | Done | 1 | 89830e3 |

