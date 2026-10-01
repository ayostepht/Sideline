/** Spike phase 2: weekly league endpoints (matchups, transactions), drafts, trending. */
import { z } from "zod";
import { API, callCount, loadEnv, spikeFetch } from "./http.js";

const { leagueId } = loadEnv();
const state = z
  .object({ week: z.number(), season: z.string() })
  .parse((await spikeFetch(`${API}/state/nfl`)).body);
const current = state.week;
console.log("current week from state:", current);

const settings = z
  .object({ settings: z.object({ playoff_week_start: z.number() }) })
  .parse((await spikeFetch(`${API}/league/${leagueId}`)).body);
const lastRegular = settings.settings.playoff_week_start - 1;

const matchupWeeks = [
  ...Array.from({ length: current }, (_, i) => i + 1),
  current + 1,
  current + 3,
  lastRegular,
  lastRegular + 1,
  18,
];
for (const w of [...new Set(matchupWeeks)]) {
  const r = await spikeFetch(`${API}/league/${leagueId}/matchups/${w}`);
  const rows = Array.isArray(r.body) ? (r.body as Record<string, unknown>[]) : [];
  const first = rows[0] ?? {};
  const pts = rows.map((x) => x.points);
  console.log(
    `matchups/${w}`,
    r.status,
    `rows=${rows.length}`,
    "keys=",
    Object.keys(first).join(","),
    "points sample=",
    JSON.stringify(pts.slice(0, 4)),
    "matchup_ids=",
    JSON.stringify(rows.map((x) => x.matchup_id)),
    "starters_len=",
    Array.isArray(first.starters) ? first.starters.length : null,
  );
}

for (let w = 1; w <= current; w++) {
  const r = await spikeFetch(`${API}/league/${leagueId}/transactions/${w}`);
  const rows = Array.isArray(r.body) ? (r.body as Record<string, unknown>[]) : [];
  const byType: Record<string, number> = {};
  for (const t of rows) {
    const key = `${String(t.type)}/${String(t.status)}`;
    byType[key] = (byType[key] ?? 0) + 1;
  }
  console.log(`transactions/${w}`, r.status, `rows=${rows.length}`, JSON.stringify(byType));
}

const drafts = await spikeFetch(`${API}/league/${leagueId}/drafts`);
const draftList = drafts.body as Record<string, unknown>[];
console.log("drafts keys", Object.keys(draftList[0] ?? {}).join(","));
const draftId = draftList[0]?.draft_id;
if (typeof draftId === "string") {
  const picks = await spikeFetch(`${API}/draft/${draftId}/picks`);
  const rows = Array.isArray(picks.body) ? (picks.body as Record<string, unknown>[]) : [];
  console.log("draft picks", picks.status, rows.length, Object.keys(rows[0] ?? {}).join(","));
}
for (const kind of ["add", "drop"]) {
  const r = await spikeFetch(`${API}/players/nfl/trending/${kind}?lookback_hours=24&limit=50`);
  const rows = Array.isArray(r.body) ? (r.body as unknown[]) : [];
  console.log(`trending/${kind}`, r.status, rows.length, JSON.stringify(rows.slice(0, 2)));
}
console.log("calls so far", callCount());
