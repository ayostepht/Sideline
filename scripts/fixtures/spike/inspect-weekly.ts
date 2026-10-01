/** Inspect projections/stats row shapes from cache. Usage: tsx inspect-weekly.ts <projections|stats> <season> <week> */
import { API_ROOT, spikeFetch } from "./http.js";

const [kind, season, week] = process.argv.slice(2);
const POS = ["QB", "RB", "WR", "TE", "K", "DEF"].map((p) => `position[]=${p}`).join("&");
const r = await spikeFetch(`${API_ROOT}/${kind}/nfl/${season}/${week}?season_type=regular&${POS}`);
const rows = r.body as Record<string, unknown>[];
console.log(
  "status",
  r.status,
  "rows",
  rows.length,
  "bytes",
  r.bytes,
  "headers",
  JSON.stringify(r.headers),
);
const topKeys = new Map<string, number>();
const statKeys = new Map<string, number>();
const byPos = new Map<string, number>();
for (const row of rows) {
  for (const k of Object.keys(row)) topKeys.set(k, (topKeys.get(k) ?? 0) + 1);
  for (const k of Object.keys(row.stats ?? {})) statKeys.set(k, (statKeys.get(k) ?? 0) + 1);
  const playerObj = (row.player ?? {}) as { position?: string };
  const pos = playerObj.position ?? "none";
  byPos.set(pos, (byPos.get(pos) ?? 0) + 1);
}
console.log("topKeys", JSON.stringify([...topKeys]));
console.log("byPos", JSON.stringify([...byPos]));
console.log("statKeys", JSON.stringify([...statKeys].sort((a, b) => b[1] - a[1])));
const pick = (pred: (x: Record<string, unknown>) => boolean) => rows.find(pred);
const qb = pick(
  (x) =>
    (x.player as Record<string, unknown> | undefined)?.position === "QB" &&
    Object.keys(x.stats as object).length > 5,
);
const def = pick(
  (x) =>
    (x.player as Record<string, unknown> | undefined)?.position === "DEF" || x.player_id === "SEA",
);
const k = pick((x) => (x.player as Record<string, unknown> | undefined)?.position === "K");
for (const [label, row] of [
  ["QB", qb],
  ["DEF", def],
  ["K", k],
] as const) {
  console.log(label, JSON.stringify(row)?.slice(0, 1500));
}
