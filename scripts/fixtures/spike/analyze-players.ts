/** Inspect players/nfl, user object privacy fields, game ids and dates in projections. */
import { gzipSync } from "node:zlib";
import { API, API_ROOT, loadEnv, spikeFetch } from "./http.js";

const { username, leagueId } = loadEnv();
const user = (await spikeFetch(`${API}/user/${encodeURIComponent(username)}`)).body as Record<
  string,
  unknown
>;
console.log(
  "user non-null keys:",
  Object.entries(user)
    .filter(([, v]) => v !== null && v !== "" && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => `${k}:${typeof v}`)
    .join(", "),
);

const pr = await spikeFetch(`${API}/players/nfl`);
const players = pr.body as Record<string, Record<string, unknown>>;
console.log("raw bytes", pr.bytes, "gzip bytes", gzipSync(pr.rawText).length);
const byPos = new Map<string, number>();
let active = 0;
let withTeam = 0;
const rank: number[] = [];
for (const p of Object.values(players)) {
  byPos.set(String(p.position), (byPos.get(String(p.position)) ?? 0) + 1);
  if (p.active === true) active++;
  if (p.team) withTeam++;
  if (typeof p.search_rank === "number" && p.search_rank < 9999999) rank.push(p.search_rank);
}
console.log("positions", JSON.stringify([...byPos]));
console.log("active", active, "withTeam", withTeam, "ranked(<9999999)", rank.length);
const atl = players.ATL;
console.log(
  "DEF ATL entry keys",
  JSON.stringify(atl ? Object.keys(atl) : null),
  "position",
  atl?.position,
  "fantasy_positions",
  JSON.stringify(atl?.fantasy_positions),
  "active",
  atl?.active,
);
console.log(
  "injury_status values",
  JSON.stringify([...new Set(Object.values(players).map((p) => String(p.injury_status)))]),
);
console.log(
  "status values",
  JSON.stringify([...new Set(Object.values(players).map((p) => String(p.status)))]),
);
const rosters = (await spikeFetch(`${API}/league/${leagueId}/rosters`)).body as {
  players: string[];
  reserve: string[] | null;
}[];
const rostered = new Set(rosters.flatMap((r) => [...r.players, ...(r.reserve ?? [])]));
console.log(
  "rostered distinct",
  rostered.size,
  "missing from players map",
  [...rostered].filter((id) => !players[id]).length,
);
console.log(
  "sample reserve player injury",
  JSON.stringify(
    rosters
      .flatMap((r) => r.reserve ?? [])
      .slice(0, 3)
      .map((id) => [id, players[id]?.injury_status, players[id]?.status]),
  ),
);
console.log(
  "sample player (public NFL data) 4881",
  JSON.stringify(players["4881"], null, 0)?.slice(0, 900),
);

const POS = ["QB", "RB", "WR", "TE", "K", "DEF"].map((p) => `position[]=${p}`).join("&");
type Row = {
  player_id: string;
  team: string | null;
  opponent: string | null;
  date: string | null;
  game_id: string;
  stats: Record<string, number>;
  week: number;
};
const rows = (await spikeFetch(`${API_ROOT}/projections/nfl/2026/4?season_type=regular&${POS}`))
  .body as Row[];
const games = new Map<string, Set<string>>();
for (const r of rows.filter((x) => x.stats.gp !== undefined)) {
  const k = `${r.game_id}|${r.date}`;
  games.set(k, new Set([...(games.get(k) ?? []), String(r.team)]));
}
console.log(
  "week 4 games:",
  JSON.stringify([...games].map(([k, v]) => `${k}:${[...v].sort().join("-")}`)),
);
console.log(
  "distinct dates among real rows",
  JSON.stringify([...new Set(rows.filter((x) => x.stats.gp !== undefined).map((x) => x.date))]),
);
console.log(
  "player_id patterns in projections: numeric",
  rows.filter((r) => /^\d+$/.test(r.player_id)).length,
  "team-code",
  rows.filter((r) => /^[A-Z]{2,3}$/.test(r.player_id)).length,
);
console.log("any time-of-day-like fields in row keys?", JSON.stringify(Object.keys(rows[0] ?? {})));
const stats3 = (await spikeFetch(`${API_ROOT}/stats/nfl/2026/3?season_type=regular&${POS}`))
  .body as Row[];
console.log("stats w3 gm dates", JSON.stringify([...new Set(stats3.map((x) => x.date))]));
