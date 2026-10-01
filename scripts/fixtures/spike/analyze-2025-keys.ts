/** Union of stat keys across cached 2025 weeks; check rarely-seen scoring keys and DEF points-allowed bucket logic. */
import { z } from "zod";
import { API, API_ROOT, loadEnv, spikeFetch } from "./http.js";

const { leagueId } = loadEnv();
const POS = ["QB", "RB", "WR", "TE", "K", "DEF"].map((p) => `position[]=${p}`).join("&");
const scoring = z
  .object({ scoring_settings: z.record(z.string(), z.number()) })
  .parse((await spikeFetch(`${API}/league/${leagueId}`)).body).scoring_settings;
type Row = { player_id: string; player: { position: string }; stats: Record<string, number> };
const seen = new Map<string, number>();
const bucketCheck = new Map<string, Set<string>>();
for (let w = 1; w <= 18; w++) {
  const rows = (await spikeFetch(`${API_ROOT}/stats/nfl/2025/${w}?season_type=regular&${POS}`))
    .body as Row[];
  for (const r of rows) {
    for (const k of Object.keys(r.stats)) seen.set(k, (seen.get(k) ?? 0) + 1);
    if (r.player.position === "DEF" && r.stats.pts_allow !== undefined) {
      const pa = r.stats.pts_allow;
      const bucket =
        Object.keys(r.stats)
          .filter((k) => /^pts_allow_/.test(k))
          .join("+") || "none";
      const label =
        pa === 0
          ? "0"
          : pa <= 6
            ? "1-6"
            : pa <= 13
              ? "7-13"
              : pa <= 20
                ? "14-20"
                : pa <= 27
                  ? "21-27"
                  : pa <= 34
                    ? "28-34"
                    : "35+";
      bucketCheck.set(label, new Set([...(bucketCheck.get(label) ?? []), bucket]));
    }
  }
}
console.log(
  "2025 stats: scoring keys NEVER seen:",
  Object.keys(scoring)
    .filter((k) => !seen.has(k))
    .join(", ") || "(none)",
);
console.log(
  "rare scoring keys counts:",
  [
    "pts_allow_0",
    "fgm_0_19",
    "fum_rec_td",
    "fgm_60p",
    "fgm_50_59",
    "def_st_td",
    "st_td",
    "safe",
    "blk_kick",
    "pass_2pt",
  ]
    .map((k) => `${k}=${seen.get(k) ?? 0}`)
    .join(" "),
);
console.log(
  "DEF pts_allow -> bucket keys:",
  JSON.stringify([...bucketCheck].map(([k, v]) => [k, [...v]])),
);
console.log("bonus keys seen:", [...seen.keys()].filter((k) => k.startsWith("bonus_")).join(", "));
console.log(
  "yds_allow keys seen:",
  [...seen.keys()].filter((k) => k.startsWith("yds_allow")).join(", "),
);
