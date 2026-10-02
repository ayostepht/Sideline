/** Which league scoring keys appear in projection rows (weeks 1-5 of 2026) vs only in actual stats? */
import { z } from "zod";
import { API, API_ROOT, loadEnv, spikeFetch } from "./http.js";

const { leagueId } = loadEnv();
const POS = ["QB", "RB", "WR", "TE", "K", "DEF"].map((p) => `position[]=${p}`).join("&");
const scoring = z
  .object({ scoring_settings: z.record(z.string(), z.number()) })
  .parse((await spikeFetch(`${API}/league/${leagueId}`)).body).scoring_settings;
const seen = new Map<string, number>();
for (const w of [1, 2, 3, 4, 5]) {
  const rows = (
    await spikeFetch(`${API_ROOT}/projections/nfl/2026/${w}?season_type=regular&${POS}`)
  ).body as {
    stats: Record<string, number>;
  }[];
  for (const r of rows) for (const k of Object.keys(r.stats)) seen.set(k, (seen.get(k) ?? 0) + 1);
}
const keys = Object.keys(scoring);
console.log("in projections:", keys.filter((k) => seen.has(k)).join(", "));
console.log("NOT in projections:", keys.filter((k) => !seen.has(k)).join(", "));
console.log(
  "projection keys beginning fg/pts_allow/yds_allow:",
  [...seen.keys()].filter((k) => /^(fg|pts_allow|yds_allow)/.test(k)).join(", "),
);
// Sample distinct DEF row for week 4 projection to see pts_allow bucket logic
const rows = (await spikeFetch(`${API_ROOT}/projections/nfl/2026/4?season_type=regular&${POS}`))
  .body as {
  player_id: string;
  stats: Record<string, number>;
  player: { position: string };
}[];
const defs = rows
  .filter((r) => r.player.position === "DEF" && r.stats.pts_allow !== undefined)
  .slice(0, 5);
for (const d of defs)
  console.log(
    d.player_id,
    JSON.stringify(
      Object.fromEntries(Object.entries(d.stats).filter(([k]) => /pts_allow/.test(k))),
    ),
  );
// players with team/opponent null?
console.log(
  "rows with null opponent (week 4):",
  rows.filter((r) => (r as unknown as { opponent: string | null }).opponent === null).length,
  "of",
  rows.length,
);
const withGp = rows.filter((r) => r.stats.gp !== undefined);
console.log(
  "rows with gp (week 4):",
  withGp.length,
  "gp values:",
  [...new Set(withGp.map((r) => r.stats.gp))].join(","),
);
