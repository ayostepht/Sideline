/** Compare scoring_settings keys with weekly stats keys, and sanity-check recomputed points vs matchups players_points. */
import { z } from "zod";
import { API, API_ROOT, loadEnv, spikeFetch } from "./http.js";

const { leagueId } = loadEnv();
const POS = ["QB", "RB", "WR", "TE", "K", "DEF"].map((p) => `position[]=${p}`).join("&");
const league = z
  .object({ scoring_settings: z.record(z.string(), z.number()) })
  .parse((await spikeFetch(`${API}/league/${leagueId}`)).body);
const scoring = league.scoring_settings;

const StatRow = z.object({
  player_id: z.string(),
  stats: z.record(z.string(), z.number()),
  team: z.string().nullable(),
});
const Matchup = z.object({
  roster_id: z.number(),
  starters: z.array(z.string()),
  players_points: z.record(z.string(), z.number()),
});

const players = z
  .record(z.string(), z.object({ position: z.string().nullable().optional() }).passthrough())
  .parse((await spikeFetch(`${API}/players/nfl`)).body);
const positionOf = (id: string): string => players[id]?.position ?? "?";

const seen = new Map<string, number>();
const weekStats = new Map<number, Map<string, Record<string, number>>>();
for (const w of [1, 2, 3]) {
  const rows = z
    .array(StatRow)
    .parse((await spikeFetch(`${API_ROOT}/stats/nfl/2026/${w}?season_type=regular&${POS}`)).body);
  const m = new Map<string, Record<string, number>>();
  for (const r of rows) {
    m.set(r.player_id, r.stats);
    for (const k of Object.keys(r.stats)) seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  weekStats.set(w, m);
}
const scoringKeys = Object.keys(scoring);
console.log(
  "MATCH (scoring key seen in stats weeks 1-3):",
  scoringKeys.filter((k) => seen.has(k)).join(", "),
);
console.log("NEVER SEEN:", scoringKeys.filter((k) => !seen.has(k)).join(", "));
const statOnly = [...seen.keys()].filter((k) => !(k in scoring));
console.log("stat keys count not in scoring:", statOnly.length);
console.log(
  "precomputed fields present:",
  ["pts_ppr", "pts_half_ppr", "pts_std"].map((k) => `${k}:${seen.get(k) ?? 0}`).join(" "),
);

function recompute(stats: Record<string, number>): number {
  let t = 0;
  for (const [k, v] of Object.entries(stats)) {
    const s = scoring[k];
    if (s !== undefined) t += v * s;
  }
  return t;
}

let total = 0;
let bad = 0;
const badRows: string[] = [];
const sanity: string[] = [];
let totalAll = 0;
let badAll = 0;
const badAllRows: string[] = [];
const byPos = new Map<string, string>();
for (const w of [1, 2, 3]) {
  const mus = z
    .array(Matchup)
    .parse((await spikeFetch(`${API}/league/${leagueId}/matchups/${w}`)).body);
  const stats = weekStats.get(w);
  if (!stats) continue;
  for (const mu of mus) {
    for (const [pid, actual] of Object.entries(mu.players_points)) {
      const st = stats.get(pid);
      const calc = st ? Math.round(recompute(st) * 100) / 100 : 0;
      const diff = Math.round((calc - actual) * 100) / 100;
      totalAll++;
      if (Math.abs(diff) > 0.01) {
        badAll++;
        badAllRows.push(
          `w${w} id=${pid} pos=${positionOf(pid)} actual=${actual} calc=${calc} diff=${diff}`,
        );
      }
    }
    for (const pid of mu.starters) {
      const actual = mu.players_points[pid];
      if (actual === undefined) continue;
      const st = stats.get(pid);
      const calc = st ? Math.round(recompute(st) * 100) / 100 : 0;
      const pos = positionOf(pid);
      total++;
      const diff = Math.round((calc - actual) * 100) / 100;
      const row = `w${w} id=${pid} pos=${pos} actual=${actual} calc=${calc} diff=${diff}${st ? "" : " (no stats row)"}`;
      if (Math.abs(diff) > 0.01) {
        bad++;
        badRows.push(row);
      }
      if (
        w === 3 &&
        !byPos.has(`${pos}${String([...byPos.keys()].filter((x) => x.startsWith(pos)).length)}`)
      ) {
        const n = [...byPos.keys()].filter((x) => x.startsWith(pos)).length;
        if (n < (["RB", "WR"].includes(pos) ? 3 : pos === "TE" ? 2 : 1))
          byPos.set(`${pos}${String(n)}`, row);
      }
      if (w === 3) sanity.push(row);
    }
  }
}
console.log(`starter-weeks compared: ${total}, mismatches>0.01: ${bad}`);
console.log(badRows.join("\n"));
console.log(
  `ALL players_points entries compared (starters and bench): ${totalAll}, mismatches>0.01: ${badAll}`,
);
console.log(badAllRows.slice(0, 20).join("\n"));
console.log("--- week 3 sanity sample ---");
console.log([...byPos.values()].join("\n"));
