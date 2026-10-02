/** Spike phase 3: players/nfl (once) and 2026 projections/stats (undocumented endpoints). */
import { z } from "zod";
import { API, API_ROOT, callCount, spikeFetch } from "./http.js";

const state = z.object({ week: z.number() }).parse((await spikeFetch(`${API}/state/nfl`)).body);
const current = state.week;

const players = await spikeFetch(`${API}/players/nfl`);
const pObj = players.body as Record<string, Record<string, unknown>>;
const ids = Object.keys(pObj);
console.log(
  "players/nfl",
  players.status,
  players.bytes,
  "bytes",
  ids.length,
  "players",
  players.elapsedMs,
  "ms",
);
console.log(
  "encoding",
  players.headers["content-encoding"],
  "cache-control",
  players.headers["cache-control"],
);
const sample = pObj["4017"] ?? pObj[ids[0] ?? ""] ?? {};
console.log("sample player keys", Object.keys(sample).join(","));

const POS = ["QB", "RB", "WR", "TE", "K", "DEF"].map((p) => `position[]=${p}`).join("&");
const weeks = Array.from({ length: current }, (_, i) => i + 1);
for (const w of [...weeks, current + 1]) {
  const r = await spikeFetch(`${API_ROOT}/projections/nfl/2026/${w}?season_type=regular&${POS}`);
  summarize(`projections/2026/${w}`, r.status, r.body, r.headers["content-type"]);
}
for (const w of weeks) {
  const r = await spikeFetch(`${API_ROOT}/stats/nfl/2026/${w}?season_type=regular&${POS}`);
  summarize(`stats/2026/${w}`, r.status, r.body, r.headers["content-type"]);
}

function summarize(label: string, status: number, body: unknown, ct: string | undefined): void {
  const isArr = Array.isArray(body);
  const rows = isArr ? (body as Record<string, unknown>[]) : [];
  const nonEmpty = rows.filter((x) => x.stats && Object.keys(x.stats).length > 0).length;
  console.log(
    label,
    status,
    ct,
    isArr ? `array(${rows.length})` : typeof body,
    `nonEmptyStats=${nonEmpty}`,
  );
}
console.log("calls so far", callCount());
