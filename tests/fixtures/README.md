# Test fixtures

Fixtures are JSON files that stand in for the Sleeper HTTP API. They are served by the MSW
handlers in `tests/msw/sleeper-handlers.ts`. Default test runs never touch the network.

## Layout contract

Root for recorded data: `tests/fixtures/sleeper/` (written by the T0.3b recorder, never by hand).

| Request | File under the root |
|---|---|
| `https://api.sleeper.app/v1/<path>` | `v1/<path>.json` |
| `https://api.sleeper.app/projections/nfl/<season>/<week>?...` | `projections/<season>/<week>.json` |
| `https://api.sleeper.app/stats/nfl/<season>/<week>?...` | `stats/<season>/<week>.json` |
| (not served over HTTP) | `manifest.json` |

Examples: `v1/state/nfl.json`, `v1/league/<leagueId>.json`, `v1/league/<leagueId>/users.json`,
`v1/league/<leagueId>/matchups/3.json`, `v1/players/nfl.json`, `v1/players/nfl/trending/add.json`.

- Query strings are ignored when looking up a file.
- A path with no file returns `404 {"error":"no fixture","path":...}` and is recorded in
  `handlers.unhandled`. Tests should assert `unhandled` is empty.
- `manifest.json`: `{ leagueId, season, weeks: number[], partialWeeks: number[], recordedAt }`.

## Synthetic fixtures

`tests/fixtures/synthetic/sleeper/` uses the same layout with a tiny two-team league. It is
hand-written and used to self-test the handlers and for edge cases (superflex, IDP, no FAAB,
divisions, preseason, offseason, week 18, empty transactions). Add edge-case trees as sibling
roots (for example `tests/fixtures/synthetic/superflex/`) and point `fixtureRoot` at them.
Synthetic ids start with `1000...` (leagues) and `2000...` (users); player ids are `9xxx`.

## Sanitization rule

Never commit real identifiers. Usernames, display names, team names, avatars and the league
name are replaced with deterministic fakes before a fixture is written. The recorder does this;
if you add a fixture by hand, use obviously fake values. The orchestrator greps every staged diff
and the whole repo at each gate for live-fetched identifiers.

## Partial weeks

Weeks listed in `manifest.partialWeeks` were still in progress when recorded. They are excluded
from SCORE-2 validation and from every golden expectation (PLAN.md 10.5, ADR-000 item 9). Use
only `manifest.weeks` minus `partialWeeks` when computing expected values.
