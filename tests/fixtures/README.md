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
- `manifest.json`: see "Manifest keys" below.

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

## Fixture groups

| Group | Path | What it is |
|---|---|---|
| Recorded Sleeper league | `tests/fixtures/sleeper/` | One real league recorded by `scripts/fixtures/record.ts`, then sanitized and trimmed. Season 2026, league `1000000000000000001`. Includes `v1/` (state, league, users, rosters, matchups for past and future weeks, transactions, drafts, user and its league list, trimmed `players/nfl`, trending), `projections/<season>/<week>.json` and `stats/<season>/<week>.json`. |
| nflverse | `tests/fixtures/nflverse/` | Trimmed copies of nflverse release CSVs (`players`, `schedules/games`, `snap_counts`, `stats_player`) in original format. `manifest.json` records source URLs, sizes, `throughWeek`, and `keepTeams` (all rows kept for those teams; other rows kept only for players in the Sleeper fixture). |
| Synthetic | `tests/fixtures/synthetic/sleeper/` | Hand-written two-team league for handler self-tests and edge cases. |
| Synthetic 2025 | `tests/fixtures/synthetic/sleeper-2025/` | Hand-written prior-season tree (offseason and rollover cases). |

The fixture worker (`pnpm --filter @sideline/worker start:fixtures`) and `pnpm db:seed:fixtures`
read the recorded group. Fixture user is `manager_04` (id `100000000000000004`); the user's league
list holds the recorded league plus a synthetic second league `1000000000000000999`.

## Sanitization rules (recorder, `scripts/fixtures/sanitize.ts`)

- Usernames, display names, team names, avatars, league and draft names are replaced by
  deterministic fakes. Fakes follow sorted order of first appearance, never a hash of the real value,
  so the same input always gives byte-identical output.
- Names become `manager_NN` where NN is the roster slot of the owner. The user object is reduced
  to `user_id, username, display_name, avatar, is_bot`.
- Keys `email, phone, token, cookies, real_name, summoner_name, summoner_region, verification` are
  dropped; chat free text is nulled.
- Only free-text keys (`display_name, username, team_name, name, description, notes, title, ...`)
  get name replacement. Enum-like fields are never rewritten. Public data (roster ids, player ids,
  NFL team codes, stats, scoring settings, player name fields) is kept as is.
- Fake id ranges (all start with the real id length): users `100000000000000001+`, leagues
  `1000000000000000001+`, drafts `1000000000000001001+`, transactions `1000000000000100001+`,
  other numeric id runs `1000000000000200001+`. Synthetic hand-written fixtures use leagues `1000...`,
  users `2000...`, player ids `9xxx`.
- Short-name word-boundary rule (leak check, `scripts/fixtures/leak-check.ts`): original names of
  4 or more characters match as a case-insensitive substring. Names under 4 characters match as a
  case-insensitive whole word (no letter, digit or underscore either side), in any string value and in
  the raw text of non-JSON files. Values under player name keys are skipped for names; ids and avatars
  are checked everywhere.
- `pnpm fixtures:check` fails if any original identifier is present anywhere in the repo.

## Manifest keys (`tests/fixtures/sleeper/manifest.json`)

| Key | Meaning |
|---|---|
| `leagueId`, `season` | Fake league id and season (string). |
| `currentWeek` | NFL week at recording time. |
| `partialWeeks` | Weeks still in progress when recorded (excluded from validation and goldens). |
| `futureMatchupWeeks` | Weeks whose matchup files hold schedule only (no points). |
| `projectionWeeks`, `statsWeeks` | Weeks that have projection and stats files. |
| `draftIds` | Fake draft ids. |
| `syntheticLeagueId` | The second, synthetic league added to the user's league list. |
| `sanitizerVersion` | Bumps when sanitizer output changes; re-record after a bump. |
| `trimming` | What was cut to stay small: `players` (kept fields, count, `excludedForNameCollision`), `rows`, and a `sanitizer` description. |
| `recordedAt` | ISO timestamp. |

## Re-recording

Needs the gitignored `.env` (`SLEEPER_USERNAME`, `DEFAULT_LEAGUE_ID`); raw responses stay in the
gitignored `.spike-cache/`. Never commit raw or unsanitized data.

1. `pnpm fixtures:record` (add `--refresh` to refetch everything except players; cache window is
   2 h, `--max-age-hours N`).
2. `pnpm fixtures:check` (leak scan across the repo) and `pnpm verify`.
3. Keep the tree under about 6 MB. Re-record with trimming rather than adding weeks.
4. nflverse: `pnpm exec tsx scripts/fixtures/nflverse.ts` (see the header of that file for flags).
5. Update tests that pin counts or weeks, and note it in `docs/PROGRESS.md`.
