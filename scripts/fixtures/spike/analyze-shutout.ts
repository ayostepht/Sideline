/** Show the stats shape for a DEF row that has the pts_allow_0 bucket (2025 data). */
import { spikeFetch } from "./http.js";

const POS = ["QB", "RB", "WR", "TE", "K", "DEF"].map((p) => `position[]=${p}`).join("&");
type Row = { player_id: string; week: number; stats: Record<string, number> };
for (let w = 1; w <= 18; w++) {
  const rows = (
    await spikeFetch(`https://api.sleeper.app/stats/nfl/2025/${w}?season_type=regular&${POS}`)
  ).body as Row[];
  const hit = rows.find((r) => r.stats.pts_allow_0 !== undefined);
  if (hit) {
    const s = hit.stats;
    console.log(
      `w${w} ${hit.player_id}`,
      JSON.stringify({
        pts_allow: s.pts_allow,
        pts_allow_0: s.pts_allow_0,
        yds_allow: s.yds_allow,
        pts_std: s.pts_std,
        pts_ppr: s.pts_ppr,
        fgm_0_19: s.fgm_0_19,
      }),
    );
    break;
  }
}
