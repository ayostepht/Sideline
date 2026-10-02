/** Spike phase 4: 2025 backtest data availability (weeks 1, 9, 18 first, then everything if present). */
import { API_ROOT, callCount, spikeFetch } from "./http.js";

const POS = ["QB", "RB", "WR", "TE", "K", "DEF"].map((p) => `position[]=${p}`).join("&");
const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 16);

async function probe(
  kind: "projections" | "stats",
  week: number,
): Promise<{ ok: boolean; line: string }> {
  const r = await spikeFetch(`${API_ROOT}/${kind}/nfl/2025/${week}?season_type=regular&${POS}`);
  const rows = Array.isArray(r.body) ? (r.body as Record<string, unknown>[]) : [];
  const real = rows.filter((x) => typeof x.last_modified === "number");
  const withPts = rows.filter(
    (x) => (x.stats as Record<string, unknown> | undefined)?.pts_ppr !== undefined,
  ).length;
  const nonEmpty = rows.filter((x) => x.stats && Object.keys(x.stats).length > 0).length;
  const lm = real.map((x) => x.last_modified as number);
  const dates = [...new Set(rows.map((x) => String(x.date)))].sort();
  const datedOnly = dates.filter((d) => d !== "null");
  const line = `${kind} w${week}: status=${r.status} rows=${rows.length} nonEmptyStats=${nonEmpty} withPtsPpr=${withPts} realRows=${real.length} ${lm.length ? `lm=${iso(Math.min(...lm))}..${iso(Math.max(...lm))}` : "lm=none"} dates=${datedOnly[0] ?? "-"}..${datedOnly[datedOnly.length - 1] ?? "-"}`;
  return { ok: r.status === 200 && rows.length > 0, line };
}

const sample = [1, 9, 18];
let allOk = true;
for (const kind of ["projections", "stats"] as const) {
  for (const w of sample) {
    const { ok, line } = await probe(kind, w);
    console.log(line);
    allOk = allOk && ok;
  }
}
if (allOk) {
  for (const kind of ["projections", "stats"] as const) {
    for (let w = 1; w <= 18; w++) {
      if (sample.includes(w)) continue;
      console.log((await probe(kind, w)).line);
    }
  }
}
console.log("calls so far", callCount());
