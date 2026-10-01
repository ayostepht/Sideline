/** Print future-matchup pairing analysis, bracket and draft shapes (ids masked). */
import { API, loadEnv, spikeFetch } from "./http.js";

const { leagueId } = loadEnv();
type M = {
  roster_id: number;
  matchup_id: number | null;
  points: number;
  players: string[];
  starters: string[];
  custom_points: unknown;
  starters_points: number[];
  players_points: Record<string, number>;
};
const rosters = (await spikeFetch(`${API}/league/${leagueId}/rosters`)).body as {
  roster_id: number;
  players: string[];
  starters: string[];
}[];
const pairing = (rows: M[]): string => {
  const g = new Map<number, number[]>();
  for (const r of rows)
    g.set(r.matchup_id ?? -1, [...(g.get(r.matchup_id ?? -1) ?? []), r.roster_id]);
  return [...g.values()]
    .map((x) => x.sort((a, b) => a - b).join("v"))
    .sort()
    .join(" ");
};
const pairs = new Map<number, string>();
for (const w of [1, 2, 3, 4, 5, 7, 14, 15, 18]) {
  const rows = (await spikeFetch(`${API}/league/${leagueId}/matchups/${w}`)).body as M[];
  pairs.set(w, pairing(rows));
  const sameAsRoster = rows.filter((r) => {
    const ro = rosters.find((x) => x.roster_id === r.roster_id);
    return ro && JSON.stringify([...ro.players].sort()) === JSON.stringify([...r.players].sort());
  }).length;
  const startersSame = rows.filter((r) => {
    const ro = rosters.find((x) => x.roster_id === r.roster_id);
    return ro && JSON.stringify(ro.starters) === JSON.stringify(r.starters);
  }).length;
  console.log(
    `w${w}: pairs=${pairing(rows)} playersEqualCurrentRoster=${sameAsRoster}/10 startersEqualCurrent=${startersSame}/10 custom_points=${JSON.stringify([...new Set(rows.map((r) => r.custom_points))])} playersPointsKeys=${Object.keys(rows[0]?.players_points ?? {}).length} startersPoints=${JSON.stringify(rows[0]?.starters_points.slice(0, 3))}`,
  );
}
const regular = new Set([...pairs.entries()].filter(([w]) => w <= 14).map(([, v]) => v));
console.log(
  "distinct pairings among w1..w14 sampled:",
  regular.size,
  "w5==w14:",
  pairs.get(5) === pairs.get(14),
  "w1==w10 unknown",
);
console.log(
  "w15 equals any earlier sampled?",
  [...pairs.entries()].filter(([w, v]) => w < 15 && v === pairs.get(15)).map(([w]) => w),
);
console.log(
  "w18 equals any earlier sampled?",
  [...pairs.entries()].filter(([w, v]) => w < 18 && v === pairs.get(18)).map(([w]) => w),
);

const mask = (v: unknown): unknown => {
  if (typeof v === "string" && /^\d{15,}$/.test(v)) return "<id>";
  if (Array.isArray(v)) return v.slice(0, 3).map(mask);
  if (v && typeof v === "object")
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mask(x)]));
  return v;
};
console.log(
  "winners_bracket",
  JSON.stringify((await spikeFetch(`${API}/league/${leagueId}/winners_bracket`)).body),
);
console.log(
  "losers_bracket",
  JSON.stringify((await spikeFetch(`${API}/league/${leagueId}/losers_bracket`)).body),
);
const drafts = (await spikeFetch(`${API}/league/${leagueId}/drafts`)).body as Record<
  string,
  unknown
>[];
const d = { ...drafts[0] };
delete d.creators;
console.log("draft", JSON.stringify(mask(d)).slice(0, 1800));
const draftId = String(drafts[0]?.draft_id);
const picks = (await spikeFetch(`${API}/draft/${draftId}/picks`)).body as Record<string, unknown>[];
console.log("pick[0]", JSON.stringify(mask(picks[0])));
console.log(
  "keeper picks",
  picks.filter((p) => p.is_keeper === true).length,
  "rounds",
  Math.max(...picks.map((p) => Number(p.round))),
);
