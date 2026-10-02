# Sleeper API notes (ground truth)

Last updated: 2026-10-02 (T1.2b real-row rules, section 4.5). This file overrides PLAN.md where they disagree.

How to read the status column: VERIFIED means it works and matches PLAN. CHANGED means it works but differs from PLAN (described). MISSING means it is not available.

All sample payloads below use fake ids and names (`user_id` "100000000000000001", `display_name` "manager_01", league "Example League", `league_id` "1000000000000000001"). Player ids, NFL team codes, stat keys and scoring values are public data and are shown as returned. Raw recordings from the spike live only in the gitignored `.spike-cache/`.

Spike facts: observed on 2026-10-01 (Thursday, NFL week 4, regular season, Thursday game not yet started). 93 HTTP calls in total (90 GET, 3 HEAD), at most 36 calls in any 60 second window, at least 1.1 s between request starts. `GET /players/nfl` was called exactly once.

## 1. Summary: top findings (decision-relevant first)

1. **Projections work (CHANGED shape, usable).** `GET https://api.sleeper.app/projections/nfl/{season}/{week}?season_type=regular&position[]=...` returns a flat JSON array. Only about 450 to 470 of roughly 3,300 rows per week are real projections (they have `stats.gp` and a non-null `opponent`); the rest are placeholder rows that hold only `adp_dd_ppr`. Source is `company: "rotowire"`. Projection keys cover most league scoring keys, with exceptions for K and DEF (section 6).
2. **No scoring key exceptions for actual stats (VERIFIED, better than expected).** Recomputing `sum(stats[k] * scoring_settings[k])` matched Sleeper's `players_points` exactly (diff under 0.01) for 457 of 457 player-weeks (weeks 1 to 3, starters and bench, includes K and DEF). SCORE-1 can be the plain formula. Zero-valued stats are omitted from rows, so a missing key means 0.
3. **Future-week matchups exist (VERIFIED).** `matchups/{week}` returns 10 paired rows for every week tried (4, 5, 7, 14, 15, 18). Regular-season pairings are a real round-robin schedule (week 5 and week 14 are identical pairings, so the cycle repeats every 9 weeks). Rows for future weeks mirror the current roster and have 0 points. Weeks 15 and later still return all 10 teams paired, which is placeholder data and not the playoff bracket. LEAGUE-5 should read weeks `start_week` through `playoff_week_start - 1` only.
4. **Waiver type is rolling (VERIFIED for code 0).** `settings.waiver_type` is `0`. Transactions have no bids, rosters carry `settings.waiver_position` (1 to 10, unique), and **failed claims are visible** (`status: "failed"`, note "This player was claimed by another owner."). `settings.waiver_budget` is 100 but unused. Waivers ran Wednesday 03:11 ET on all three observed weeks. See section 8.
5. **2025 backtest data is complete (VERIFIED).** Projections and stats both return data for all 18 regular-season weeks of 2025. Projections look pre-game (mean absolute error versus actual PPR points is about 4.2 to 4.7, and exact matches are rare), but `last_modified` is a post-week stamp, so it cannot prove timing. See section 7.
6. **No kickoff times anywhere in Sleeper (MISSING).** Rows only carry a calendar `date` (YYYY-MM-DD), no time. We can tell Thursday, Sunday and Monday games apart but not early versus late Sunday. Lock windows need nflverse schedule times or the PLAN 3.4 fallback windows. See section 9.
7. **`GET /players/nfl` is bigger than documented (CHANGED).** 14.7 MB uncompressed (2.25 MB gzipped on the wire), 12,229 entries, one call took 222 ms. DEF entries are keyed by team code ("ATL"). It is CDN cached for 10 minutes, but the once-per-day rule still stands.
8. **Conditional requests work.** Responses carry `ETag`, and `If-None-Match` returns `304` with an empty body. Responses sit behind Cloudflare with `s-maxage` between 60 s (state, matchups) and 3,600 s (projections, stats), so polling faster than that returns cached data. No rate-limit headers were present.
9. **Steph's league matches "10 team, PPR, 1 QB"** (section 10). Extra facts: 2 FLEX slots (RB/WR/TE), K, DEF, 5 bench, 2 IR slots, no taxi, no divisions, 6 playoff teams starting week 15, redraft.
10. **Undocumented endpoints are fragile in specific ways.** `projections` without `season_type` returns `400 {"error":"bad-request"}`. The position filter is not strict (FB, P, CB, DB rows leak through). Weeks outside the season (for example 25) still return placeholder rows. Stats for a week with no games yet return `200 []`. The provider must check for real rows, not just HTTP 200.
11. **nflverse works as the kickoff and usage source, with one join problem (VERIFIED 2026-10-02, T1.4a).** Schedules carry ET kickoff times for all 272 games, `spread_line` positive means the home team is favored, and weekly stats and snap counts exist for weeks 1 to 3. But Sleeper's `gsis_id` is set for only about 26% of relevant 2026 skill players (64 of 244), so the provider must fall back to name plus team matching (99%). Red-zone touches need play-by-play. See section 14.

## 2. Endpoint table

Base: `https://api.sleeper.app/v1` unless noted. "Edge cache" is the `cache-control` s-maxage seen.

| Endpoint | Status | Notes | Edge cache | Refresh suggestion |
|---|---|---|---|---|
| `GET /state/nfl` | VERIFIED | `week`, `display_week`, `season`, `season_type`, `season_start_date`, `season_has_scores`, `leg` | 60 s | 15 min; 5 min in game windows |
| `GET /user/{username}` | VERIFIED | Returns many fields, only 5 are non-null (section 4.2). Unknown username returns `200` with body `null`. | 120 s | On demand |
| `GET /user/{user_id}/leagues/nfl/{season}` | VERIFIED | Array of league-shaped objects (name, settings, roster_positions, scoring_settings) | 300 s | On demand, daily |
| `GET /league/{id}` | VERIFIED | Settings, scoring_settings, roster_positions. `previous_league_id` is null here. Unknown id returns `404` with body `null`. | 300 s | Hourly |
| `GET /league/{id}/users` | VERIFIED | `metadata.team_name` is missing for some managers (1 of 10 here) | 300 s | Hourly |
| `GET /league/{id}/rosters` | VERIFIED | `settings.waiver_position`, `settings.waiver_budget_used`, `reserve` (IR), `taxi`, `metadata.record`, `metadata.streak` | 300 s | 15 min; 5 min in game windows |
| `GET /league/{id}/matchups/{week}` | VERIFIED | Future weeks exist through at least week 18. Weeks 0 and 30 return `200 []`. | 60 s | 15 min; 2 min for current week in game windows |
| `GET /league/{id}/transactions/{week}` | VERIFIED | Includes failed waiver claims. The `{week}` is the `leg` value. Week 12 (not played yet) returns `200 []`. | 300 s | 15 min |
| `GET /league/{id}/traded_picks` | VERIFIED | Empty array `[]` in this league | 300 s | Daily |
| `GET /league/{id}/winners_bracket`, `losers_bracket` | VERIFIED | Not empty before the playoffs: pre-seeded bracket with null winners (section 3.9) | 300 s | Hourly in playoffs, daily before |
| `GET /league/{id}/drafts` | VERIFIED | One completed snake draft, 10 teams, 15 rounds | 120 s | Daily |
| `GET /draft/{draft_id}/picks` | VERIFIED | 150 picks. Unknown draft id returns `404`. | 86,400 s | Daily |
| `GET /players/nfl` | CHANGED | 14.7 MB raw, 2.25 MB gzip, 12,229 entries | 600 s | Once daily, off-peak |
| `GET /players/nfl/trending/{add\|drop}?lookback_hours=24&limit=50` | VERIFIED | Array of `{player_id, count}` | 600 s | 30 min |
| `GET https://api.sleeper.app/projections/nfl/{season}/{week}` | CHANGED | Undocumented. Needs `season_type`. Placeholder rows mixed in. | 600 to 3,600 s | Hourly, plus a snapshot before kickoff |
| `GET https://api.sleeper.app/stats/nfl/{season}/{week}` | VERIFIED | Undocumented. `[]` for a week with no games yet. | 300 to 3,600 s | 15 min in game windows, daily otherwise |
| `HEAD https://sleepercdn.com/content/nfl/players/thumb/{player_id}.jpg` | VERIFIED | `200 image/jpeg`, `cache-control: public, max-age=2678400` | CDN | Cache in browser |
| `HEAD https://sleepercdn.com/avatars/thumbs/{avatar_id}` | VERIFIED | `200 image/png` | CDN | Cache in browser |

Response times: median 14 to 100 ms for everything except `/players/nfl` (222 ms). All responses were gzip encoded.

## 3. Documented endpoints: samples

### 3.1 `GET /state/nfl`

```json
{
  "week": 4,
  "leg": 4,
  "display_week": 4,
  "season": "2026",
  "season_type": "regular",
  "league_season": "2026",
  "previous_season": "2025",
  "season_start_date": "2026-09-09",
  "league_create_season": "2026",
  "season_has_scores": true
}
```

Note: `season_start_date` is a Wednesday. Do not assume games only start on Thursday.

### 3.2 `GET /user/{username}`

Keys returned: `avatar, cookies, created, currencies, data_updated, deleted, display_name, email, is_bot, metadata, notifications, pending, phone, real_name, solicitable, summoner_name, summoner_region, token, user_id, username, verification`. Only `avatar`, `display_name`, `is_bot`, `user_id`, `username` were non-null for a public lookup. The schema should require only `user_id` and `display_name` and never store `email`, `phone` or `token`.

```json
{ "user_id": "100000000000000001", "username": "manager_01", "display_name": "manager_01", "avatar": "<32 char id>", "is_bot": false }
```

### 3.3 `GET /user/{user_id}/leagues/nfl/2026`

Array (1 item for this account) of league-shaped objects (name, status, settings, scoring_settings, roster_positions, league_id and similar). The extra fields differ slightly from `GET /league/{id}`, so validate only the fields used.

### 3.4 `GET /league/{id}`

```json
{
  "league_id": "1000000000000000001",
  "name": "Example League",
  "status": "in_season",
  "season": "2026",
  "season_type": "regular",
  "sport": "nfl",
  "total_rosters": 10,
  "previous_league_id": null,
  "avatar": null,
  "draft_id": "1000000000000000002",
  "roster_positions": ["QB","RB","RB","WR","WR","TE","FLEX","FLEX","K","DEF","BN","BN","BN","BN","BN"],
  "scoring_settings": { "rec": 1, "pass_yd": 0.04, "pass_td": 4, "pass_int": -1 },
  "settings": { "num_teams": 10, "type": 0, "best_ball": 0, "leg": 4, "last_scored_leg": 3, "playoff_teams": 6, "playoff_week_start": 15, "reserve_slots": 2, "taxi_slots": 0 },
  "metadata": { "auto_continue": "on", "keeper_deadline": "0" }
}
```

Full settings and scoring values are in sections 8 and 10. Note: `settings.draft_rounds` is 3 but the actual draft had 15 rounds, so do not use it for draft recap. The draft object has the real round count (`settings.rounds`).

### 3.5 `GET /league/{id}/users`

```json
[{
  "user_id": "100000000000000001",
  "display_name": "manager_01",
  "avatar": "<32 char id>",
  "is_owner": true,
  "is_bot": false,
  "league_id": "1000000000000000001",
  "settings": null,
  "metadata": { "team_name": "Example Team", "allow_pn": "on", "mention_pn": "on" }
}]
```

- `metadata.team_name` is absent for 1 of 10 managers. Fall back to `display_name`.
- `is_owner` is `true` for the commissioner and `null` (not `false`) for others.
- `metadata.avatar` (a full `https://...` URL for a custom team avatar) exists for 3 of 10. `metadata.allow_sms` is optional.
- Avatar URL pattern verified: `https://sleepercdn.com/avatars/thumbs/{avatar_id}` returns `200 image/png`.
- Privacy: `team_name`, `display_name`, `avatar` and `metadata.avatar` all need sanitizing in fixtures.

### 3.6 `GET /league/{id}/rosters`

```json
{
  "roster_id": 1,
  "owner_id": "100000000000000001",
  "co_owners": null,
  "league_id": "1000000000000000001",
  "players": ["11576", "11646", "12490", "ATL"],
  "starters": ["3294", "9224", "12490", "7547"],
  "reserve": null,
  "taxi": null,
  "keepers": null,
  "player_map": null,
  "metadata": { "record": "WLL", "streak": "2L" },
  "settings": {
    "wins": 1, "losses": 2, "ties": 0,
    "fpts": 366, "fpts_decimal": 28, "fpts_against": 399, "fpts_against_decimal": 46,
    "ppts": 432, "ppts_decimal": 40,
    "total_moves": 0, "waiver_position": 10, "waiver_budget_used": 0
  }
}
```

- Points are split into an integer and a `_decimal` part (two digits). `fpts` 366 with `fpts_decimal` 28 means 366.28.
- Rosters held 15 or 16 players; `reserve` (IR) was non-null for 3 of 10 rosters; `taxi` null for all.
- DEF players appear in `players` and `starters` as the team code ("ATL"), not a number.
- Empty lineup slots would show as the string `"0"` in `starters` (none were present, so unverified).
- `owner_id` was non-null for all 10; `co_owners` null for all.
- Rostered distinct players: 153. All 153 ids exist in `/players/nfl`.

### 3.7 `GET /league/{id}/matchups/{week}`

```json
{
  "roster_id": 1,
  "matchup_id": 5,
  "points": 141.3,
  "custom_points": null,
  "players": ["11576", "11646", "ATL"],
  "starters": ["3294", "9224", "12490", "MIN"],
  "starters_points": [15.4, 18.8, 9.8, 17],
  "players_points": { "3294": 15.4, "9224": 18.8, "MIN": 17 }
}
```

- 10 rows per week, 2 rows share each `matchup_id`. The `matchup_id` is per-week and not stable between weeks.
- `starters` order matches `roster_positions` order (non-bench slots), and `starters_points` is parallel to it.
- `players_points` covers every player in `players` (starters and bench, verified for weeks 1 to 3), keyed by player id or team code.
- Current week with no games started: `points` 0, `starters_points` all 0.
- Matchup `points` equals the sum of `starters_points` (checked for weeks 1 to 3, all 10 rows each).

**Future-week matchups (LEAGUE-5 question): yes, they exist.** Weeks tried: 4, 5, 7, 14, 15, 18, all `200` with 10 rows.

| Week | Pairings (roster ids) | Notes |
|---|---|---|
| 4 | 1v5 2v9 3v4 6v10 7v8 | current week, nothing scored yet |
| 5 | 1v2 3v5 4v6 7v10 8v9 | future |
| 7 | 1v3 2v6 4v8 5v7 9v10 | future |
| 14 | 1v2 3v5 4v6 7v10 8v9 | last regular-season week, identical to week 5 |
| 15 | 1v9 2v3 4v7 5v6 8v10 | playoff week, still 10 teams paired (placeholder) |
| 18 | 1v7 2v8 3v6 4v9 5v10 | placeholder |

- Regular season weeks 1 to 14 form a valid schedule: every week is 5 pairs, and week `w` has the same pairings as week `w + 9` (1 and 10, 2 and 11, 3 and 12, 4 and 13, 5 and 14 are identical; weeks 6 to 9 are unique; checked all 14 weeks). Use these for remaining-schedule simulation.
- `players` and `starters` in future weeks equal the current roster (10 of 10 rosters), so they are not a forecast of anything.
- Weeks 15 and later do not follow the playoff bracket. Ignore them for odds; use `playoff_teams` and bracket logic instead.
- Bye or odd-team-count behavior (`matchup_id: null`) was not observable with 10 teams.

### 3.8 `GET /league/{id}/transactions/{week}`

See section 8 for the full shapes. Summary of observed counts (waiver/complete, waiver/failed, free_agent/complete): week 1 (3, 0, 14), week 2 (6, 3, 17), week 3 (5, 7, 9), week 4 (0, 0, 6). No `trade` transactions existed in weeks 1 to 4.

### 3.9 `GET /league/{id}/winners_bracket` and `losers_bracket`

Not empty before the playoffs. The bracket is pre-seeded for known first-round matchups and has null winners (`w`) and losers (`l`). Positions use roster ids.

```json
[
  { "m": 1, "r": 1, "w": null, "l": null, "t1": 4, "t2": 9 },
  { "m": 3, "r": 2, "w": null, "l": null, "t1": 2, "t2": null, "t2_from": { "w": 1 } },
  { "m": 6, "r": 3, "p": 1, "w": null, "l": null, "t1": null, "t2": null, "t1_from": { "w": 3 }, "t2_from": { "w": 4 } }
]
```

- Winners bracket has 7 rows for a 6-team playoff (2 byes into round 2); losers bracket has 4 rows.
- `t1_from`/`t2_from` hold `{ "w": matchId }` or `{ "l": matchId }`. `p` is the placement being decided (1 = championship, 3 = third place, 5 = fifth place).
- The first-round bracket pairs are already filled in even though the regular season is not over, so treat them as a projection of current standings, not a result.

### 3.10 `GET /league/{id}/drafts` and `GET /draft/{draft_id}/picks`

Draft keys: `created, creators, draft_id, draft_order, last_message_id, last_message_time, last_picked, league_id, metadata, season, season_type, settings, sport, start_time, status, type`. Sanitizing note: `metadata.name` repeats the league name, `draft_order` is keyed by real `user_id`, and `creators` lists user ids.

Pick keys: `draft_id, draft_slot, is_keeper, metadata, pick_no, picked_by, player_id, reactions, roster_id, round`. `metadata` embeds a player snapshot (name, position, team, injury status), `is_keeper` was `null` (not false) for every pick. 150 picks (10 teams, 15 rounds).

### 3.11 `GET /league/{id}/traded_picks`

`[]` (200). No picks have been traded in this league. Shape not observed.

### 3.12 `GET /players/nfl/trending/{add|drop}?lookback_hours=24&limit=50`

Both returned 50 rows. Sorted by `count` descending.

```json
[{ "player_id": "3321", "count": 504184 }, { "player_id": "12718", "count": 485757 }]
```

### 3.13 `GET /players/nfl`

- Size: 14,660,850 bytes raw, 2,252,614 bytes gzip. The `~5 MB` figure in PLAN and Sleeper docs is out of date.
- 12,229 entries, an object keyed by `player_id`. Only 2,763 have a `team`, 9,422 have `active: true`, 2,791 have a real `search_rank`.
- Positions seen: QB 474, RB 935, WR 1790, TE 843, K 192, DEF 32, and many IDP and line positions (LB, DE, DT, CB, S, OL...). 240 entries have `position: null`.
- DEF is keyed by team code ("ATL") and has only: `active, position, last_name, first_name, sport, team, player_id, fantasy_positions, injury_status`.
- `injury_status` values: `null, "", Sus, Questionable, NA, Out, IR, DNR, PUP, COV, Doubtful`.
- `status` values: `Active, Inactive, Injured Reserve, Physically Unable to Perform, Non Football Injury, Practice Squad, null`.
- Useful fields: `player_id, full_name, first_name, last_name, position, fantasy_positions, team, status, injury_status, injury_body_part, active, depth_chart_order, search_rank, number, age, years_exp, gsis_id, news_updated`. `gsis_id` helps join nflverse data.

Trimmed sample (public NFL data):

```json
{ "player_id": "4881", "full_name": "Lamar Jackson", "position": "QB", "fantasy_positions": ["QB"], "team": "BAL", "status": "Active", "injury_status": "Questionable", "search_rank": 10, "depth_chart_order": 1, "years_exp": 8 }
```

- Headshot: `https://sleepercdn.com/content/nfl/players/thumb/{player_id}.jpg` returned `200 image/jpeg` (27 KB, `max-age=2678400`). For DEF use team code. A team logo guess `https://sleepercdn.com/images/team_logos/nfl/atl.png` also returned `200 image/png` (found by guessing, undocumented; do not depend on it).

## 4. Projections and stats details (undocumented endpoints)

### 4.1 Request and response shape

- URL: `https://api.sleeper.app/projections/nfl/{season}/{week}?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF`; same for `/stats/nfl/...`.
- `season_type` is required: omitting it returns `400 {"error":"bad-request"}`.
- Response is a flat JSON array (not an object keyed by player id).
- Row keys (projections): `status, date, stats, category, last_modified, week, sport, season_type, season, player, team, player_id, opponent, updated_at, game_id, week_shard, company`. Stats rows have the same set (`category: "stat"`).
- Rows per week: projections 3,302 to 3,306 (about 360 to 470 real), stats 636 to 804 (only players with activity that week).
- Placeholder rows: in projections, rows with no `gp` have `opponent: null`, `last_modified`/`updated_at`/`status` absent and `stats` holding only `adp_dd_ppr` (plus `pos_adp_dd_ppr` on some). Filter to `stats.gp !== undefined` (or `opponent !== null`).
- Position filter leaks: FB (70), P (4), CB (1), DB (1) rows appear even with the six `position[]` params. Filter by league positions after fetching.
- `company`: `rotowire` for projections, `sportradar` for stats. `category`: `proj` or `stat`.
- `week_shard` is an internal value like `"3_5"`; ignore it.
- `game_id` looks like `2026` + `1` + two-digit week + two-digit index (for example `202610408` in week 4). Both teams in a game share it. Treat as an opaque grouping key.

Projection row (trimmed):

```json
{
  "player_id": "11559", "team": "ATL", "opponent": "GB", "date": "2026-09-24",
  "game_id": "202610312", "week": 3, "season": "2026", "season_type": "regular",
  "company": "rotowire", "category": "proj", "status": null,
  "last_modified": 1790654414310, "updated_at": 1790654414310,
  "stats": { "gp": 1, "pass_yd": 200.8, "pass_td": 1.14, "pass_int": 0.5, "rush_yd": 8.65, "fum_lost": 0.16, "pts_ppr": 13.44, "pts_half_ppr": 13.44, "pts_std": 13.44, "adp_dd_ppr": 175 },
  "player": { "position": "QB", "fantasy_positions": ["QB"], "team": "ATL", "injury_status": null, "first_name": "Michael", "last_name": "Penix" }
}
```

### 4.2 DEF and K keying

- DEF rows: `player_id` is the **team code** ("ATL"), `player.position` is `"DEF"`, `player.first_name` is the city and `last_name` the mascot. 32 DEF rows per week in both projections and stats.
- K rows use normal numeric player ids with `player.position: "K"`.
- DEF stats keys (actual): `sack, int, ff, fum_rec, def_td, safe, blk_kick, def_st_td, def_st_ff, def_st_fum_rec, st_td, pts_allow, pts_allow_{bucket}, yds_allow, yds_allow_{bucket}` and many extras (`tkl`, `qb_hit`, `fan_pts_allow_*`).
- A DEF row carries both `pts_allow` (raw) and the bucket key (`pts_allow_14_20: 1`). When points allowed is 0, `pts_allow` is **omitted** and `pts_allow_0: 1` is present (confirmed on a 2025 shutout).
- Buckets used by this league: `pts_allow_0, _1_6, _7_13, _14_20, _21_27, _28_34, _35p`. Bucket edges in the data: 0, 1 to 6, 7 to 13, 14 to 20, 21 to 27, 28 to 34, 35+. Projection DEF rows use one bucket derived from projected points (for example 20.5 gives `pts_allow_14_20`), so they carry no distribution.
- yards-allowed keys (`yds_allow_0_100` up to `yds_allow_550p`) exist, but this league does not score them.

### 4.3 Precomputed point fields

Rows include `pts_ppr`, `pts_half_ppr`, `pts_std` (about 350 to 360 of 760 to 800 stats rows, about 445 of 3,306 projection rows). These use Sleeper's default scoring, not the league's. Do not use them for league scoring. They are useful for a sanity check and as a fallback ranking when `scoring_settings` fails to load. Stats rows also include `pos_rank_ppr`, `pos_rank_half_ppr`, `pos_rank_std` (999 for DEF and K).

### 4.4 Timing fields and freshness

- `date` is `YYYY-MM-DD` (game day, no time). Week 4 games fell on 2026-10-01 (Thu, 1 game), 2026-10-04 (Sun, 14 games) and 2026-10-05 (Mon, 1 game).
- `last_modified` and `updated_at` are epoch milliseconds. For stats they move during and after games. For projections the value is a single stamp per week (all rows identical):
  - Week 1 of 2026: 2026-09-15 04:00Z (Tuesday midnight ET, after the week).
  - Week 3: 2026-09-29 04:00Z. Week 4 (current): 2026-10-01 15:00Z. Week 5 (future): 2026-09-28 23:45Z.
  - So a projection's stamp for a played week is the week-end stamp, and the current week is refreshed during the week.
- Week 4 stats right now: `200 []` (no games played). Week 5 projections exist (3,304 rows, 469 real). Only one week ahead was checked.

### 4.5 Real-row rules (T1.2b)

Dated 2026-10-02. Implemented in `packages/sleeper/src/endpoints/real-rows.ts`, checked against `tests/fixtures/sleeper/`. HTTP 200 is never treated as success: when no real row remains the client returns `status: "unavailable"` (`reason: "empty"` for `[]`, `"no_real_rows"` otherwise).

Order of checks per row: (1) fails row validation: `other`; (2) position missing or not one of QB, RB, WR, TE, K, DEF: `position`; (3) fails the kind's real-row rule: `placeholder`. So a leaked FB placeholder counts as `position`.

**Projections rule:** `stats.gp` present AND `opponent` not null. Placeholders hold only `adp_dd_ppr` (and `pos_adp_dd_ppr`), with `opponent: null`, `date: null`.

**Stats rule (different):** `opponent` not null. `gp` is not required. In the fixtures 84 to 157 stats rows per week have no `gp` yet are real: players whose game happened but who did not play, with stats like `{ "gms_active": 1, "pos_rank_ppr": 999 }` (QB, RB, WR, TE and one K, no DEF). Requiring `gp` would drop them. No placeholder stats rows exist in the trimmed fixtures (the recorder keeps real rows plus rows for kept players), so the stats placeholder rule rests on the same `opponent: null` signal as projections and is untested against live data.

Neither rule looks at point totals. A player with a bye has no row at all and is not "dropped"; byes come from the schedule (ADR-006 item 7). A real row with tiny stats (for example `{ "gp": 1, "fgm_30_39": 0.01 }`) is always kept.

Counts from the recorded (trimmed) fixtures, `tests/fixtures/sleeper/`. Total is rows in the fixture file, not the live API (live projections have about 3,300 rows per week, see sections 4.1 and 7).

| Kind | Week | Total | Kept | Dropped placeholder | Dropped position | Dropped other |
|---|---|---|---|---|---|---|
| projections | 1 | 644 | 441 | 127 | 76 | 0 |
| projections | 2 | 694 | 450 | 168 | 76 | 0 |
| projections | 3 | 743 | 443 | 224 | 76 | 0 |
| projections | 4 | 782 | 461 | 245 | 76 | 0 |
| projections | 5 (future) | 825 | 464 | 285 | 76 | 0 |
| stats | 1 | 578 | 569 | 0 | 9 | 0 |
| stats | 2 | 616 | 607 | 0 | 9 | 0 |
| stats | 3 | 648 | 639 | 0 | 9 | 0 |
| stats | 4 (no games yet) | 0 | 0 | 0 | 0 | 0 (`unavailable`, reason `empty`) |

Projection position drops are 71 placeholder rows plus 5 real rows of FB, P, CB or DB. Stats position drops are FB and DB rows (all with `gp` or `gms_active`). The synthetic fixtures (`tests/fixtures/synthetic/`) have no `player`, `opponent` or `gp` on their rows, so both kinds come back `unavailable` (2 dropped as `position`); the `ok` path is covered by the recorded fixtures and in-test rows.

Other client behavior worth knowing: `GET /user/{username}` returns `data: null` for an unknown user; the user schema strips every field except `user_id`, `display_name`, `username`, `avatar`, `is_bot`. Each `/players/nfl` entry is validated on its own, and invalid entries are skipped and counted (all 1,021 recorded entries are valid). The client never sends `If-None-Match` for `/players/nfl`; the once-per-day rule is enforced by the worker. `previous_league_id` of `"0"` or `""` is mapped to null.

## 5. Stat key mapping (SCORE-1)

League `scoring_settings` has 43 keys. Compared with stats rows for 2026 weeks 1 to 3 and all of 2025:

**Match by name (40 keys seen in 2026 stats, no renaming needed):** `pass_yd, pass_td, pass_int, pass_2pt, rush_yd, rush_td, rush_2pt, rec, rec_yd, rec_td, rec_2pt, fum, fum_lost, fum_rec, xpm, xpmiss, fgm_20_29, fgm_30_39, fgm_40_49, fgm_50_59, fgm_60p, fgmiss, sack, int, ff, safe, blk_kick, def_td, def_st_td, def_st_ff, def_st_fum_rec, st_td, st_ff, st_fum_rec, pts_allow_1_6, pts_allow_7_13, pts_allow_14_20, pts_allow_21_27, pts_allow_28_34, pts_allow_35p`.

**Never seen in 2026 weeks 1 to 3 (suspected exceptions, but all resolved):** `pts_allow_0`, `fgm_0_19`, `fum_rec_td`. They are simply rare events. In 2025 weeks 1 to 18 all three appear in stats rows (`pts_allow_0` 7 times, `fgm_0_19` 4, `fum_rec_td` 2) under the same names. Result: **no key mapping exceptions are needed for actual stats.** Rare keys must still be read (do not drop unknown scoring keys; just score every key present in both).

**Stat keys not in this league's scoring (162 of them in 2026 stats):** these are ignored. Examples: `bonus_*` (bonus_fd_qb, bonus_rec_wr, bonus_pass_yd_300...), `yds_allow_*`, `rush_rec_yd`, `pass_air_yd`, tackles and IDP keys. If another league scores a `bonus_*` key it will work by name.

### Sanity check: recomputed points versus `players_points`

Method: `calc = round(sum(stats[k] * scoring[k]), 2)` using the stats row for the same week, compared with `matchups/{week}.players_points`. Missing stats row means 0.

Totals: 300 of 300 starter-weeks (weeks 1 to 3) and 457 of 457 `players_points` entries including bench match within 0.01. Week 3 sample (10 starters, all positions):

| Player id | Pos | players_points | Recomputed | Diff |
|---|---|---|---|---|
| 5849 | QB | 11.42 | 11.42 | 0 |
| 9224 | RB | 8.90 | 8.90 | 0 |
| 12490 | RB | 17.00 | 17.00 | 0 |
| 7547 | WR | 11.90 | 11.90 | 0 |
| 8137 | WR | 15.20 | 15.20 | 0 |
| 12517 | TE | 7.10 | 7.10 | 0 |
| 11586 | RB (flex) | 3.50 | 3.50 | 0 |
| 11646 | WR (flex) | 3.80 | 3.80 | 0 |
| 3451 | K | 5.00 | 5.00 | 0 |
| MIN | DEF | 17.00 | 17.00 | 0 |

Caveats: this league has no bonus keys, so bonus handling is untested. Scoring uses the stats endpoint after Sleeper's stat corrections; `last_modified` on stats rows moves for up to a week after games, so recompute SCORE-2 only for weeks that are final.

## 6. Projection key coverage (SCORE-3 exceptions)

Compared with 2026 projection rows (weeks 1 to 5):

**Present in projections:** `pass_yd, pass_td, pass_int, pass_2pt, rush_yd, rush_td, rush_2pt, rec, rec_yd, rec_td, rec_2pt, fum, fum_lost, fum_rec, xpm, xpmiss, fgm_0_19, fgm_20_29, fgm_30_39, fgm_40_49, sack, int, ff, safe, blk_kick, def_td, st_td, pts_allow_14_20, pts_allow_21_27, pts_allow_28_34`.

**Not present, with suggested handling:**

| League key | Projection equivalent | Handling |
|---|---|---|
| `fgm_50_59`, `fgm_60p` | `fgm_50p` (combined) | Score `fgm_50p` using the `fgm_50_59` value (5). Cannot split 60+, small error. |
| `fgmiss` | `fgmiss_30_39`, `fgmiss_40_49`, `fgmiss_50p`, plus `fga` and `fgm` | `fgmiss = fga - fgm` (or sum of the `fgmiss_*` keys). |
| `pts_allow_0`, `pts_allow_1_6`, `pts_allow_7_13`, `pts_allow_35p` | single bucket from projected `pts_allow` | Projected DEF points allowed is a mean; only one bucket key is set (14 to 34 in practice). Consider using `pts_allow` directly with a smoothed bucket expectation. |
| `def_st_td`, `def_st_ff`, `def_st_fum_rec`, `st_ff`, `st_fum_rec` | `def_fum_td`, `def_kr_yd`, `def_pr_yd`, `pass_int_td` | Small expected values; treat as 0 and note it in reasons. |
| `fum_rec_td` | `def_fum_td` is not the same thing | Treat as 0. |

Other projection keys of note: `rec_tgt`, `rec_fd`, `rush_att`, `pass_att`, `pass_cmp`, `cmp_pct`, `fgm_yds`, `yds_allow`, `pts_allow`, `tkl_loss`, `gp` (always 1 for real rows), and `bonus_*` keys. Value ranges are expected counts (fractions like `pass_td: 1.14`).

## 7. 2025 backtest data availability

`season_type=regular`, six position params. "Real rows" = projection rows with `stats.gp`. All requests returned `200`.

| Week | Proj rows | Proj real rows | Proj has pts_ppr | Stats rows | Stats has pts_ppr | Game dates |
|---|---|---|---|---|---|---|
| 1 | 3306 | 426 | 419 | 759 | 360 | 09-04 to 09-08 |
| 2 | 3306 | 424 | 420 | 757 | 360 | 09-11 to 09-15 |
| 3 | 3306 | 414 | 412 | 762 | 357 | 09-18 to 09-22 |
| 4 | 3306 | 413 | 409 | 771 | 351 | 09-25 to 09-29 |
| 5 | 3302 | 364 | 357 | 679 | 320 | 10-02 to 10-06 |
| 6 | 3304 | 384 | 379 | 725 | 322 | 10-09 to 10-13 |
| 7 | 3304 | 407 | 402 | 736 | 326 | 10-16 to 10-20 |
| 8 | 3300 | 358 | 352 | 636 | 298 | 10-23 to 10-27 |
| 9 | 3302 | 377 | 374 | 685 | 308 | 10-30 to 11-03 |
| 10 | 3302 | 385 | 382 | 687 | 307 | 11-06 to 11-10 |
| 11 | 3304 | 411 | 408 | 738 | 341 | 11-13 to 11-17 |
| 12 | 3302 | 382 | 380 | 687 | 307 | 11-20 to 11-24 |
| 13 | 3306 | 435 | 431 | 792 | 344 | 11-27 to 12-01 |
| 14 | 3302 | 385 | 382 | 694 | 322 | 12-04 to 12-08 |
| 15 | 3306 | 447 | 445 | 796 | 342 | 12-11 to 12-15 |
| 16 | 3306 | 440 | 438 | 795 | 366 | 12-18 to 12-22 |
| 17 | 3306 | 428 | 426 | 795 | 363 | 12-25 to 12-29 |
| 18 | 3306 | 436 | 429 | 804 | 363 | 01-03 to 01-04 |

Pre-game question: are 2025 projections pre-game values? Evidence is indirect.
- `last_modified` for 2025 weeks 1 to 4 is one bulk stamp (2025-10-06 15:45Z); weeks 5 to 18 are stamped on the Tuesday after the week (04:00 to 05:30Z). These are post-week stamps, so timing cannot be proven from the field.
- Values are not contaminated by results: comparing projected `pts_ppr` with actual `pts_ppr` gave MAE 4.17 (2025 w1), 4.49 (w9), 4.74 (w18), and 4.81, 4.53, 4.84 for 2026 weeks 1 to 3. Exact matches (diff under 0.01) were 0 to 3 players per week. Mean projection (8.6 to 9.2) is close to mean actual (8.1 to 9.5).
- Conclusion: usable as the backtest baseline, probably the last pre-game values. Treat as "closing" projections, which may be slightly more accurate than what a user would have seen earlier in the week. Record this caveat in backtest reports.
- Recommendation for the worker (T1.x): store each projection fetch with its fetch time so Sideline builds its own pre-game history from now on.

## 8. Waivers (ADR-003, WAIVER-6)

### 8.1 League settings keys containing "waiver"

| Key | Value | Meaning |
|---|---|---|
| `waiver_type` | 0 | Rolling waivers (see 8.2) |
| `waiver_budget` | 100 | FAAB budget. Present but unused when `waiver_type` is not FAAB. |
| `waiver_bid_min` | 0 | Minimum FAAB bid |
| `waiver_day_of_week` | 2 | Day waivers process. See 8.3. |
| `waiver_clear_days` | 2 | Days a dropped player stays on waivers before becoming a free agent |
| `daily_waivers` | 0 | Daily waiver runs disabled |
| `daily_waivers_hour` | 0 | Hour of day for daily runs (unused while `daily_waivers` is 0) |
| `daily_waivers_days` | 5461 | Bitmask, binary `1010101010101` (0b1010101010101). Unused while daily waivers is 0. |
| `daily_waivers_last_ran` | 22 | Counter or hour marker. Meaning unknown, ignore. |

Related keys: `disable_adds` 0, `offseason_adds` 0, `faab_suggestions` 1, `trade_deadline` 11 (week).

### 8.2 `waiver_type` code meanings

- Code **0 = rolling waivers**. Confidence: high. Evidence in this league: `waiver_type` is 0, no transaction has a bid (`waiver_budget` is `[]` on every transaction and `settings` never has `waiver_bid`), all `waiver_budget_used` are 0, and `waiver_position` is a unique 1 to 10 order that behaves like a rolling list (the roster with the most recent successful claim sits last). Steph also confirmed rolling waivers.
- Code 1 = reverse standings order, code 2 = FAAB. Confidence: medium-low. Found only in a secondary web search snippet ("0 = rolling, 1 = reverse, 2 = faab"); the official docs (https://docs.sleeper.com) do not define these fields. Not verifiable without another league. Sideline should treat 2 as FAAB and unknown values as "standard order" with a warning.
- Official docs do mention that a transaction's `settings` "could be {'waiver_bid': 44} if it's FAAB waivers".

### 8.3 Schedule

All three in-season waiver runs finished on a Wednesday at 07:11Z (03:11 ET, 00:11 PT): 2026-09-16, 2026-09-23, 2026-09-30. A preseason run (a week 1 transaction) finished on Monday 2026-08-24 at 19:57 ET, so preseason or offseason runs follow a different schedule; only trust the weekly rhythm in season. 03:00 ET and 00:00 PT are the same instant all year, so the 11 minute lag is the processing time. With `waiver_day_of_week` 2 this means: **2 = Wednesday (0 = Monday)**, run at about 03:00 ET. Confidence: medium (one league, one value). For WAIVER-6d, derive "next run" from `waiver_day_of_week` at 03:00 ET and compare with the last observed waiver `status_updated`. Players dropped sit on waivers for `waiver_clear_days` (2) and then become first come, first served free agents. Free agent adds are instant (for example 2026-09-30 16:17 ET).

### 8.4 Roster fields

`rosters[].settings.waiver_position` is present on every roster (1 to 10, each value used once; 1 = first claim priority). `waiver_budget_used` is present (0). `total_moves` is present (0 for the first roster shown, so it may not count claims; do not rely on it).

Current order observed (roster id: position): 1:10, 2:7, 3:1, 4:9, 5:8, 6:2, 7:3, 8:4, 9:5, 10:6.

### 8.5 Transaction shapes

All transactions: `status, type, metadata, created, settings, leg, draft_picks, creator, transaction_id, adds, drops, consenter_ids, roster_ids, status_updated, waiver_budget`. Keys `adds` and `drops` map `player_id` (or team code) to `roster_id`, and are `null` when empty. `created` and `status_updated` are epoch ms. `leg` equals the week the transaction belongs to.

Waiver, complete:

```json
{
  "type": "waiver", "status": "complete", "leg": 2,
  "created": 1790123598898, "status_updated": 1790147476343,
  "creator": "100000000000000001", "transaction_id": "1000000000000000003",
  "adds": { "9228": 10 }, "drops": { "11566": 10 },
  "roster_ids": [10], "consenter_ids": [10],
  "settings": { "seq": 1 }, "waiver_budget": [], "draft_picks": [],
  "metadata": { "notes": "Your waiver claim was processed successfully!" }
}
```

Waiver, failed (**failed claims are visible**):

```json
{
  "type": "waiver", "status": "failed", "leg": 2,
  "adds": { "12545": 4 }, "drops": null,
  "settings": { "priority": 0, "seq": 5 },
  "metadata": { "notes": "This player was claimed by another owner." }
}
```

Free agent (instant add or drop, `settings` and `metadata` are `null`):

```json
{ "type": "free_agent", "status": "complete", "leg": 4, "adds": { "1479": 8 }, "drops": { "10222": 8 }, "settings": null, "metadata": null }
```

Trade: **not observed** (no trades in weeks 1 to 4). Expect `type: "trade"`, `roster_ids` with every team involved, `adds`/`drops` mapping players to the receiving or sending roster, `draft_picks` populated, and `waiver_budget` populated when FAAB is traded. Verify when a trade occurs.

Counts across weeks 1 to 4: 14 waiver/complete, 10 waiver/failed, 46 free_agent/complete. No `pending` status was seen; **unprocessed claims by other teams are not visible** (week 4 has none even though managers may have queued claims). Treat other teams' pending claims as unknowable.

### 8.6 `settings.seq` and `settings.priority` (inferred, confidence medium)

- `settings.seq`: the order in which claims were processed in a waiver run, 0 first, unique within one run (a run is the set of transactions sharing the same `status_updated`). Observed 0 to 8 (week 2) and 0 to 11 (week 3). Week 1 shows two `seq` 0 values because it holds the preseason run and the first in-season run. A lower `seq` for the same player means that claim was evaluated first and won. This lets us rebuild who was ahead of whom for WAIVER-6b.
- `settings.priority`: present only on some claims. It looks like the manager's own ordering among several simultaneous claims (0 = their first preference, 1 = second, ...). Seen only for rosters that submitted multiple claims in one run, values 0 to 3. It is not the league waiver position.
- A claim fails with "This player was claimed by another owner." when another claim for the same player processed first. Other failure reasons were not observed (for example roster full, dropped player gone).
- Each failed claim row is the proof of competing demand: the same player appears on the failed rows of the losing rosters and the complete row of the winner, which sets up the WAIVER-6b "competing claims" signal from history.

## 9. Lock and kickoff time source

- Sleeper: **none**. Neither `/state/nfl`, `/players/nfl`, projections nor stats include a game time. The only per-game information is `date` (calendar day), `opponent` and a shared `game_id`.
- Usable from Sleeper: which games are on Thursday, Sunday or Monday (by `date`), and who plays whom (by `team`/`opponent`). Not usable: Sunday early versus late versus night.
- Provider plan: nflverse schedule for exact kickoff times, with the PLAN 3.4 fallback windows (Thu 20:00 to 24:00, Sun 13:00 to 24:00, Mon 20:00 to 24:00 ET) when it fails. The fallback treats all of Sunday as one lock window, which is acceptable for refresh cadence but too coarse for per-player lineup locks.
- Late week check: in week 4, the Thursday game is in `date` 2026-10-01, matching the real schedule.
- Spread sign (PLAN 3.3): VERIFIED in T1.4a, see section 14d. Kickoff times and their time zone: section 14c.

## 10. League settings versus "10 team, PPR, 1 QB"

| Item | Value | Matches description? |
|---|---|---|
| `total_rosters` / `settings.num_teams` | 10 / 10 | Yes |
| `scoring_settings.rec` | 1 | Yes, full PPR |
| `roster_positions` | QB, RB, RB, WR, WR, TE, FLEX, FLEX, K, DEF, BN x5 (15 slots) | Yes, 1 QB and no SUPER_FLEX. Note 2 FLEX slots and K and DEF. |
| `settings.reserve_slots` | 2 (IR) | New info |
| `settings.taxi_slots` | 0 | No taxi |
| `settings.playoff_teams` | 6 | New info (2 byes) |
| `settings.playoff_week_start` | 15 | New info; regular season is weeks 1 to 14 |
| `settings.playoff_seed_type` | 0 | Meaning not documented, treat as default (record, then points for) |
| `settings.playoff_type` / `playoff_round_type` | 0 / 0 | Not documented |
| divisions | No `divisions` key in settings, and no division field on rosters | No divisions |
| `settings.type` | 0 (redraft). `max_keepers` is 1 and metadata has `keeper_deadline`, but `is_keeper` is null on all picks. | Redraft, matches |
| `settings.best_ball` | 0 | Not best ball |
| `previous_league_id` | null (not carried from a prior season) | n/a |
| `settings.last_scored_leg` | 3 (current `leg` is 4) | Consistent with week 4 not started |
| `settings.trade_deadline` | 11 | New info |
| `reserve_allow_out/doubtful/sus/dnr/cov/na` | all 0 | IR accepts only players whose status is "IR". The 3 IR rosters examined had `injury_status: "IR"`. Inference, medium confidence. |
| `league_average_match` | 0 | No extra median game |
| `settings.draft_rounds` | 3 | **Mismatch:** the actual draft ran 15 rounds. Ignore this key. |

**No mismatches with the description.** Scoring keys of note: 4 pt pass TD (`pass_td` 4), `pass_yd` 0.04, `pass_int` -1, `rush_yd` 0.1, `rec_yd` 0.1, `rec` 1, TDs 6, `fum_lost` -2, `fum` 0, K: `xpm` 1, FG 3 to 6 by distance, `fgmiss` -1, `xpmiss` -1; DEF: `sack` 1, `int` 2, `fum_rec` 2, `safe` 2, `ff` 1, `blk_kick` 2, TDs 6, points-allowed buckets 10, 7, 4, 1, 0, -1, -4; no bonuses and no yards-allowed scoring.

## 11. Other API behavior

- **Rate-limit headers:** none (`x-ratelimit-*` and `retry-after` absent). No 429 was seen at 36 calls per minute. Sleeper's stated guidance is under 1000 calls per minute.
- **Caching:** Cloudflare in front, `cache-control: public, s-maxage=N, stale-while-revalidate, stale-if-error`. `age` and `cf-cache-status` headers are present. ETag supports `If-None-Match` with `304`.
- **Not found:** unknown user returns `200` with body `null`; unknown league or draft returns `404` with body `null`; matchup or transaction weeks with nothing return `200 []`.
- **Compression:** gzip on all JSON.
- **User-Agent:** a custom value was accepted without issue.
- **IDs:** player ids are strings of digits, except DEF which uses team codes. `league_id`, `user_id`, `draft_id`, `transaction_id` are 18 to 19 digit strings.
- **Avatar URLs:** `https://sleepercdn.com/avatars/thumbs/{avatar_id}` (PNG). Some teams carry `metadata.avatar` as a full URL.
- **Team name location:** `metadata.team_name` on `/league/{id}/users`, nullable and missing for managers who never set one.
- **Zero stats:** zero-valued stat keys are omitted from stats and projection rows.

## 12. Open risks

1. Projections and stats are undocumented and may change shape or disappear. Validate with zod, tolerate unknown keys, and fail the job cleanly. Check for real rows (`gp` present), not just HTTP 200.
2. No kickoff times in Sleeper. Per-player lineup locks need nflverse (feature-flagged) or fall back to coarse windows.
3. `waiver_type` codes 1 and 2 are from a secondary source. Treat unknown values defensively.
4. Waiver day mapping (0 = Monday) and the 03:00 ET run time are inferred from one league.
5. `trade`-type transaction shape and `traded_picks` rows have not been observed in this league (none exist yet). Capture a sample once a trade happens.
6. Other managers' pending waiver claims are not visible, so WAIVER-6b must work from roster needs only.
7. Projection `last_modified` is a post-week stamp, so "pre-game" cannot be proven from the API. Snapshot projections before kickoff in our own tables.
8. The players endpoint is 14.7 MB uncompressed. Parse it once per day and persist only a trimmed set of fields.
9. Stat corrections: `last_modified` on stats rows can move for several days after a game. Rescore from the latest rows rather than caching final scores too early.
10. Only one league (10 teams, no divisions, no bonuses, no trades) was examined. IDP, SUPER_FLEX, divisions and bonus scoring rely on synthetic fixtures.

## 13. Recorded fixtures and extra privacy findings (2026-10-01, T0.3b)

Recorder: `scripts/fixtures/record.ts` writes sanitized fixtures to `tests/fixtures/sleeper/` (layout in `tests/fixtures/README.md`). `--check` re-derives the original identifiers from the gitignored raw cache and fails if any survive. 40 GET calls, at most 40 in any 60 s window; `GET /players/nfl` was reused from the cache (the recorder never refetches it within 24 h).

Fields found while sanitizing that matter for any code that stores or logs API data:

- League and user-league objects carry chat state: `last_message_id`, `last_message_time`, `last_message_text_map` (free text, null here), `last_message_attachment`, `last_author_id`, `last_author_display_name`, `last_author_avatar`, `last_author_is_bot`, `last_read_id`, `last_pinned_message_id`. The last author can be a bot account (it was in this league). Do not persist these; none are needed.
- `GET /user/{username}` has 21 keys (email, phone, token, cookies, real_name, summoner_name and others, all null for a public lookup). Persist only `user_id`, `username`, `display_name`, `avatar`, `is_bot`.
- Draft `metadata.description` is free text (empty here); `draft_order` is keyed by user id; `creators` and every pick's `picked_by` are user ids.
- Player records in `/players/nfl`, projections and stats carry `metadata.channel_id` (a 19 digit public chat channel id). It is not a league identifier; do not treat 19 digit strings as private when they sit under player data.
- A manager's team name can equal a real player's name (it did here). Public player name fields (`full_name`, `first_name`, ...) are never rewritten; the leak check ignores them.
- The `GET /user/{id}/leagues/nfl/{season}` fixture holds the primary league plus one synthetic second league (`Example League 2`, id `1000000000000000999`) so the league picker can be tested.
- Fixture size 5.6 MB: players trimmed from 12,229 to 1,021 entries; each projections week keeps all real rows, rows for kept players, all leaked-position rows and 30 placeholder rows; stats keep real rows plus rows for kept players. Detail per week is in `manifest.json` under `trimming`.

## 14. nflverse (T1.4a)

Dated 2026-10-02. Spike plus recorder `scripts/fixtures/nflverse.ts` (fixtures in `tests/fixtures/nflverse/`, 348 KB). Raw downloads stay in the gitignored `.spike-cache/nflverse/`. All facts below were observed on the real 2026 assets, not assumed.

### 14a. Assets, formats, cadence

All from GitHub releases of `nflverse/nflverse-data`. URL pattern: `https://github.com/nflverse/nflverse-data/releases/download/<tag>/<asset>`. Each asset comes as `.csv`, `.csv.gz`, `.parquet`, `.rds` (and an older `.qs`). The recorder uses `.csv.gz` (about 5x smaller). Asset metadata (name, size, `updated_at`) comes from `GET https://api.github.com/repos/nflverse/nflverse-data/releases/tags/<tag>` (60 unauthenticated calls per hour per IP, plenty for 4 tags).

| Data | Tag | Asset (csv.gz) | gz size | `updated_at` observed | Rows |
|---|---|---|---|---|---|
| Schedules, all seasons | `schedules` | `games.csv.gz` | 514 KB (2.2 MB csv) | 2026-10-02T03:49Z | 7,548 total, 272 for 2026 (all REG, weeks 1 to 18) |
| Weekly player stats | `stats_player` | `stats_player_week_2026.csv.gz` | 218 KB | 2026-10-01T16:26Z | 3,339 (weeks 1, 2, 3: 1,118 / 1,107 / 1,114) |
| Snap counts | `snap_counts` | `snap_counts_2026.csv.gz` | 85 KB | 2026-09-29T11:01Z | 4,488 (weeks 1, 2, 3: 1,492 / 1,502 / 1,494) |
| Player id map | `players` | `players.csv.gz` | 2.5 MB (7.3 MB csv) | 2026-10-01T15:10Z | 24,838 |
| Team weekly stats (optional) | `stats_team` | `stats_team_week_2026.csv` | 40 KB | not recorded | 96 |
| Play-by-play (not used) | `pbp` | `play_by_play_2026.csv.gz` | 3.26 MB (16.7 MB csv) | 2026-10-01T16:24Z | not downloaded |

- Naming: the old `player_stats` release is stale. Current player stats live in the `stats_player` release as `stats_player_week_<season>`, `stats_player_reg_<season>`, `stats_player_regpost_<season>` (season totals) and `stats_player_post_<season>`. Use `stats_player_week_<season>`. There is one asset per season (no per-week file).
- Cadence and lag: the stats asset was updated 2026-10-01 16:26Z and holds weeks 1 to 3 only. Week 4 started on the evening of 2026-10-01 ET, so a finished week appears in the stats asset about a day or more after its last game. Snap counts were updated 2026-09-29 11:01Z with weeks 1 to 3 (the week 3 Monday night game was 2026-09-28, so they landed the next morning, a lag of roughly 12 hours). Schedules refresh nightly (03:49Z) and pick up new scores and lines. Only one observation of each, so treat the cadence as "about daily", not a guarantee.
- Weeks 1 to 3 of 2026 are present in all three weekly assets. Weeks 4+ are absent until each week finishes. The provider must treat "week missing" as "no usage data yet", not as an error.
- The `schedules` asset holds every season since 1999 in one file; filter on `season`.

### 14b. Usage columns (PLAN 4.5 `usage_week`)

| usage_week column | Source | Notes |
|---|---|---|
| `snap_pct` | `snap_counts.offense_pct` | Fraction 0 to 1 (a full-time QB is `1`, 0.9 is 90%). Not a percent. Also `offense_snaps`, `defense_snaps`, `st_snaps`, `st_pct`. |
| `targets` | `stats_player_week.targets` | |
| `target_share` | `stats_player_week.target_share` | Provided, fraction 0 to 1. Verified equal to `targets / sum(team targets in that game)` (KC week 1: Worthy 6 of 25 = 0.24). Blank is not used; 3,339 of 3,339 rows have a value. |
| `air_yards_share` | `stats_player_week.air_yards_share` | Provided, can be negative (net negative air yards). |
| `carries` | `stats_player_week.carries` | |
| `carry_share` | NOT provided. Compute | `carries / sum(carries of every player on that team in that game)`. The sum includes QBs and WRs. Verified: KC week 1 player carries sum to 38, equal to `stats_team_week_2026.carries` for KC week 1 (38). Guard divide by zero (team with 0 carries gives null). The recorder keeps every row for KC and SF so tests can run this. |
| `rz_touches` | NOT available | See below. |

- Also present and cheap: `wopr` (weighted opportunity), `receiving_air_yards`, `fantasy_points_ppr`.
- Red-zone touches: no column anywhere in `stats_player_week` (header grepped for red, rz, zone, inside: no matches), `snap_counts` or `stats_team_week` (only `carries`). It needs play-by-play (`yardline_100 <= 20` on rush and target plays). The 2026 pbp asset is 3.26 MB gz and 16.7 MB csv, and grows each week (the 2025 full-season file was 97.9 MB csv, 19.1 MB gz). Decision already made (ADR-005 item 13): TREND-2 ships without `rz_touches` (nullable column), play-by-play goes to the P1 backlog.
- Rows with the same player and week appear once per game (no double headers in the NFL, so effectively once per player per week). `season_type` is `REG` for every row seen.

### 14c. Kickoff time semantics

- `gameday` is `YYYY-MM-DD` and `gametime` is `HH:MM` 24-hour, both in **America/New_York wall-clock time**. Evidence: the international games all read `09:30` (ET for a 14:30 BST London or 15:30 CET Madrid local kickoff, the real NFL pattern), and Sunday slot times are 13:00, 16:05, 16:25 and 20:20 (ET). `weekday` is the English weekday of `gameday` (observed: Sunday 228, Thursday 19, Monday 17, Friday 4, Saturday 2, Wednesday 2).
- Observed 2026 `gametime` values: 09:30, 13:00, 15:00, 16:05, 16:25, 16:30, 17:00, 20:00, 20:15, 20:20, 20:35. All 272 games have one.
- Conversion rule: parse `gameday` + `gametime` as an America/New_York local time (IANA zone, so DST is handled), then convert to UTC. Never use a fixed offset. DST ends **2026-11-01** (first Sunday of November): ET is UTC-4 before 02:00 that day and UTC-5 after. `kickoffUtc()` in `scripts/fixtures/nflverse-lib.ts` does this with `Intl.DateTimeFormat` and a two-pass offset correction; it has tests for both sides of the boundary.
- Worked examples (from the 2026 schedule):
  - September: `2026_01_CHI_CAR`, gameday `2026-09-13`, gametime `13:00`, EDT (UTC-4) gives `2026-09-13T17:00:00Z`.
  - After DST ends: `2026_11_MIN_SF`, gameday `2026-11-22`, gametime `20:20`, EST (UTC-5) gives `2026-11-23T01:20:00Z`. Same wall time on a September Sunday would be 00:20Z, so one hour shifts.
  - Boundary day: `2026_08_*` games on `2026-11-01` at `13:00` are already EST, so `2026-11-01T18:00:00Z`.
- International games: `location` is `Neutral` (8 of 272 in 2026: Melbourne, Rio, London twice, Paris, Madrid, Munich, Mexico City), `gametime` is still ET (the `09:30` games). `home_team` is the nominal home team. Cross-check after the DST change: `2026_09_CIN_ATL` in Madrid, gameday `2026-11-08`, `09:30` ET = `2026-11-08T14:30:00Z` = 15:30 CET, a normal European afternoon kickoff. Before the change, `2026_04_IND_WAS` in London, `2026-10-04`, `09:30` ET = `13:30Z` = 14:30 BST.
- Odd calendar days exist: week 1 has a Wednesday game (`2026_01_NE_SEA`, 2026-09-09 20:20) and the Melbourne game is Thursday 20:35 ET. Never assume Thursday, Sunday or Monday only. Group lock windows by the actual kickoff instants.
- If `gametime` is empty or `gameday` is malformed (`kickoffUtc` returns null; in past seasons old games have blank times): use the ADR-002 fallback (Sunday 13:00 ET, other days 20:00 ET on the game date) and set `kickoffApproximate = true` in the reason payload. Do not drop the game.

### 14d. Spread sign and implied totals

- **`spread_line` positive means the HOME team is favored** (it is the number of points the home team is favored by). Confidence: high.
- Evidence: (1) `home_moneyline` agrees with the sign of `spread_line` (positive spread and negative home moneyline, or the reverse) in 280 of 285 games in 2025 and 75 of 77 in 2026 (the misses are near pick'ems where the lines round differently). (2) `2026_01_CLE_JAX` (away CLE, home JAX): `spread_line` 8.5, `home_moneyline` -470, `away_moneyline` 360, JAX won 34 to 10. (3) `2026_01_ARI_LAC`: `spread_line` 8.5, `home_moneyline` -455: home LAC favored by 8.5 but lost 14 to 26 (the moneyline, not the result, is the evidence). (4) Negative case: `2026_02_PHI_TEN` (home TEN): `spread_line` -7, `home_moneyline` 260, `away_moneyline` -325, away PHI favored. (5) 2025 week 1 `DAL_PHI`: `spread_line` 8.5, `home_moneyline` -425, PHI won 24 to 20. Note `result` is `home_score - away_score`, so a positive `result` and positive `spread_line` mean a home win and a home favorite; they correlate (about 0.5 in 2025) but a result is not the line.
- `total_line` is the over/under for combined points (for example 44.5 or 47.5). `total` is the actual combined score (result), not the line.
- Implied team totals: `home = total_line / 2 + spread_line / 2`, `away = total_line / 2 - spread_line / 2`. Example: spread 3, total 44.5 gives home 23.75, away 20.75. `impliedTotals()` in `nflverse-lib.ts` is tested.
- Lines are present only for upcoming games roughly through the current week (77 of 272 games have `spread_line` and `total_line` on 2026-10-02: weeks 1 to 4 and part of week 5; later weeks are blank). Missing lines mean "no implied total", never a zero.

### 14e. Team codes: nflverse versus Sleeper

Compared the 32 codes in the 2026 schedule and weekly stats against the `team` values in `tests/fixtures/sleeper/v1/players/nfl.json` (and the 32 DEF player ids, which equal the Sleeper team codes).

| Sleeper | nflverse |
|---|---|
| `LAR` | `LA` |

That is the only difference (all 31 other codes match: ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LAC LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS). `schedule`, stats and snap counts all use `LA`. Older seasons use `OAK`, `SD` and `STL`, which only matter for pre-2020 data. Sleeper `team` can be `null` (free agents), so the join must skip nulls.

### 14f. Player id joins

- Weekly stats `player_id` is the gsis id (`00-00xxxxx`). Sleeper `gsis_id` matches the same format, with two problems:
  1. **Coverage is poor.** In the full Sleeper `/players/nfl` response only 156 of 822 active QB/RB/WR/TE on a team have a `gsis_id` (19%); `espn_id` covers about 25%. Of the 244 QB/RB/WR/TE with at least 10 PPR points in weeks 1 to 3, only **64 (26%)** join by `gsis_id`. Many top players are missing it (for example high `search_rank` rookies and some veterans). The trimmed fixture has `gsis_id` for 291 of 1,021 players.
  2. **Whitespace.** 866 of 3,886 Sleeper `gsis_id` values in the full response have a leading space (for example `" 00-0026300"`). Always `trim()`.
  3. nflverse has 3 stats rows with a blank `player_id` and blank name (position blank); skip them.
- Fallback join that works: normalized `full_name` + team (Sleeper `LAR` mapped to `LA`) against `player_display_name` + `team`. Normalize by lowercasing, dropping `.` and `'`, dropping suffixes (jr, sr, ii, iii, iv, v) and collapsing spaces. Result on the 244 relevant players: **242 of 244 (99.2%)**, no key collisions in the fixture. The 2 misses are nicknames (Sleeper `Joshua Palmer` vs nflverse `Josh Palmer`; `Matt Hibner` vs `Matthew Hibner`), which would need a position-and-team-only tiebreak or an alias table. Recommended provider order: trimmed `gsis_id`, then name+team (+position when two candidates), then give up and leave usage null.
- Another route, `espn_id` (Sleeper) to `players.csv.espn_id` to `gsis_id`, reaches only 80 of 244 here (combined with gsis), far below the name join, and the trimmed Sleeper player table does not keep `espn_id`. Not recommended.
- DEF and K: nflverse player stats have no team-defense rows (DEF scores come from Sleeper stats, or `stats_team` if ever needed). Kickers appear as `K` rows with a gsis id and join the same way. Rows with team `null` in Sleeper never join.
- Snap counts use the PFR id (`pfr_player_id`, like `StraCo01`), the player name and the team code. Join to gsis through `players.csv`: `https://github.com/nflverse/nflverse-data/releases/download/players/players.csv.gz` (2.5 MB gz, 7.3 MB csv, refreshed about daily) has `gsis_id` and `pfr_id` side by side. 1,676 of 1,679 distinct snap-count pfr ids exist there, and 243 of 244 relevant stats players have a `pfr_id`. A name+team join also works on snap counts directly. The provider can skip the 2.5 MB players asset if it joins snap counts by name+team; the recorder keeps a 644 row id-map subset (`players/players.csv`: gsis_id, pfr_id, display_name, position, latest_team, last_season) so the pfr route stays testable.
- Snap counts also include offensive linemen and defenders; filter by position when ingesting.

### 14g. Bye weeks

Byes derive from the schedule: a team with no game in a regular-season week has a bye. Verified for 2026: weeks 1 to 4 and 12, 15 to 18 have all 32 teams; byes fall in weeks 5 to 14 (week 5: 2 teams, 6: 4, 7: 4, 8: 4, 9: 2, 10: 4, 11: 6, 13: 4, 14: 2; week 12 has none). Every one of the 32 teams has exactly one bye. No separate bye asset is needed.

### 14h. Recorder behavior

`pnpm exec tsx scripts/fixtures/nflverse.ts [--from-cache] [--season N] [--through-week N]`. Defaults to downloading only missing assets (8 calls on a cold cache: 4 release lookups and 4 downloads, 1.1 s apart, `User-Agent: Sideline-fixture-recorder/0.0.0 (self-hosted)`). `--from-cache` makes no network call and fails if the cache is missing. Output (sorted, LF, original column names, trimmed): `schedules/games.csv` (272 rows), `stats_player/stats_player_week_2026.csv` (1,470 rows), `snap_counts/snap_counts_2026.csv` (1,703 rows), `players/players.csv` (644 rows), `manifest.json` (source URLs, asset `updated_at`, `recordedAt` taken from the cache download time so reruns are identical, row counts, columns). Stats and snap rows kept: Sleeper fixture players by trimmed gsis id or normalized name plus team, and every row for KC and SF. No Sleeper API calls; the only Sleeper input is the committed player fixture (ids, names, teams).

## 15. Sync job behavior (2026-10-02, T1.5b)

Worker decisions that follow from the API behavior above (no new endpoint facts):

- Matchups: each run fetches the current week and the previous week (final scores can land after the week rolls over), plus any completed or future week (through `playoff_week_start - 1`, default 15 if unset) that is not stored yet. A week with no stored rows is refetched on every run until Sleeper returns rows.
- Stats and projections: stats refetch current and previous week; projections fetch current and next week (next week exists a week early, section 4.4). `pre` maps to week 1; `off` and `post` skip.
- Pregame snapshots join the player's team (`row.team`, `row.player.team`, or the DEF id) to the schedule by team code, mapping Sleeper `LAR` to the schedule's `LA` (section 14e). Without a schedule row (nflverse not synced yet) no snapshot is written and the job note says so.
- `/players/nfl` is guarded to once per 24 h, always without ETag. A fantasy position whose count drops more than 10% versus the stored set (stored count at least 20) logs a warning; the sync still completes.
- Backfill stores 2025 regular-season weeks 1 to 18 without ETags (36 calls) and skips weeks already present.

```json
{ "projections_snapshot_rule": "fetched_at < kickoff_utc (strict)", "players_min_interval_hours": 24 }
```
