/** Verify a few claims made in the notes: schedule cycle across weeks 1-14, matchup sums, waiver seq uniqueness, trending order. */
import { API, loadEnv, spikeFetch } from "./http.js";

const { leagueId } = loadEnv();
type M = {
  roster_id: number;
  matchup_id: number;
  points: number;
  starters_points: number[];
  players: string[];
  players_points: Record<string, number>;
};
const pairKey = (rows: M[]): string => {
  const g = new Map<number, number[]>();
  for (const r of rows) g.set(r.matchup_id, [...(g.get(r.matchup_id) ?? []), r.roster_id]);
  return [...g.values()]
    .map((x) => x.sort((a, b) => a - b).join("v"))
    .sort()
    .join(" ");
};
const seen = new Map<string, number[]>();
for (let w = 1; w <= 14; w++) {
  const rows = (await spikeFetch(`${API}/league/${leagueId}/matchups/${w}`)).body as M[];
  const key = pairKey(rows);
  seen.set(key, [...(seen.get(key) ?? []), w]);
  if (w <= 3) {
    const bad = rows.filter(
      (r) => Math.abs(r.starters_points.reduce((a, b) => a + b, 0) - r.points) > 0.011,
    ).length;
    const ppAll = rows.every((r) => r.players.length === Object.keys(r.players_points).length);
    console.log(
      `w${w}: points!=sum(starters_points) rows=${bad}; players_points covers all players=${ppAll}`,
    );
  }
}
console.log("schedule groups (same pairings):", JSON.stringify([...seen.values()]));
const seqs: Record<number, number[]> = {};
for (let w = 1; w <= 4; w++) {
  const tx = (await spikeFetch(`${API}/league/${leagueId}/transactions/${w}`)).body as {
    type: string;
    settings: { seq?: number } | null;
  }[];
  seqs[w] = tx
    .filter((t) => t.type === "waiver")
    .map((t) => t.settings?.seq ?? -1)
    .sort((a, b) => a - b);
}
console.log("waiver seq by week", JSON.stringify(seqs));
const tr = (await spikeFetch(`${API}/players/nfl/trending/add?lookback_hours=24&limit=50`))
  .body as { count: number }[];
console.log(
  "trending sorted desc:",
  tr.every((x, i) => i === 0 || (tr[i - 1]?.count ?? 0) >= x.count),
);
