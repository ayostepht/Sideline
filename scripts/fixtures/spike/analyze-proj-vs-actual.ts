/** Are weekly projections pre-game (independent of actuals) or contaminated by results? Compares pts_ppr proj vs stat. */
import { API_ROOT, spikeFetch } from "./http.js";

const POS = ["QB", "RB", "WR", "TE", "K", "DEF"].map((p) => `position[]=${p}`).join("&");
type Row = { player_id: string; stats: Record<string, number> };
async function load(
  kind: string,
  season: number,
  w: number,
): Promise<Map<string, Record<string, number>>> {
  const r = await spikeFetch(`${API_ROOT}/${kind}/nfl/${season}/${w}?season_type=regular&${POS}`);
  return new Map((r.body as Row[]).map((x) => [x.player_id, x.stats]));
}
const cases: [number, number][] = [
  [2025, 1],
  [2025, 9],
  [2025, 18],
  [2026, 1],
  [2026, 2],
  [2026, 3],
];
for (const [season, w] of cases) {
  const proj = await load("projections", season, w);
  const act = await load("stats", season, w);
  let n = 0,
    exact = 0,
    absSum = 0,
    projSum = 0,
    actSum = 0,
    noProjForActive = 0,
    activeN = 0;
  for (const [id, a] of act) {
    if (a.pts_ppr === undefined || a.gp === undefined) continue;
    activeN++;
    const p = proj.get(id);
    if (p?.pts_ppr === undefined) {
      noProjForActive++;
      continue;
    }
    n++;
    const d = Math.abs(p.pts_ppr - a.pts_ppr);
    if (d < 0.01) exact++;
    absSum += d;
    projSum += p.pts_ppr;
    actSum += a.pts_ppr;
  }
  console.log(
    `${season} w${w}: active=${activeN} withProj=${n} noProj=${noProjForActive} exactEq=${exact} MAE=${(absSum / n).toFixed(2)} meanProj=${(projSum / n).toFixed(2)} meanAct=${(actSum / n).toFixed(2)}`,
  );
}
