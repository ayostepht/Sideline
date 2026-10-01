/** Summarize timing/meta fields of projections or stats rows from cache. Usage: tsx inspect-meta.ts <kind> <season> <weeks comma list> */
import { API_ROOT, spikeFetch } from "./http.js";

const [kind, season, weeksArg] = process.argv.slice(2);
const POS = ["QB", "RB", "WR", "TE", "K", "DEF"].map((p) => `position[]=${p}`).join("&");
const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 16);
for (const w of (weeksArg ?? "").split(",")) {
  const r = await spikeFetch(`${API_ROOT}/${kind}/nfl/${season}/${w}?season_type=regular&${POS}`);
  const rows = Array.isArray(r.body) ? (r.body as Record<string, unknown>[]) : [];
  const real = rows.filter((x) => typeof x.last_modified === "number");
  const lm = real.map((x) => x.last_modified as number);
  const dates = [...new Set(rows.map((x) => String(x.date)))].sort();
  const games = new Set(real.map((x) => String(x.game_id)));
  const companies = [...new Set(rows.map((x) => String(x.company)))];
  const cats = [...new Set(rows.map((x) => String(x.category)))];
  const withGp = rows.filter(
    (x) => (x.stats as Record<string, unknown> | undefined)?.gp !== undefined,
  ).length;
  const withPts = rows.filter(
    (x) => (x.stats as Record<string, unknown> | undefined)?.pts_ppr !== undefined,
  ).length;
  console.log(
    `${kind}/${season}/${w}: status=${r.status} rows=${rows.length} realRows(last_modified)=${real.length} gp=${withGp} pts_ppr=${withPts}`,
    lm.length
      ? `last_modified=${iso(Math.min(...lm))}..${iso(Math.max(...lm))}`
      : "last_modified=none",
    `dates=${dates.join("|")}`,
    `games=${games.size}`,
    `company=${companies.join("|")}`,
    `category=${cats.join("|")}`,
  );
}
