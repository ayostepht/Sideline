/** Print roster and transaction shapes with identifying values masked. */
import { API, loadEnv, spikeFetch } from "./http.js";

const { leagueId } = loadEnv();
const mask = (v: unknown): unknown => {
  if (typeof v === "string" && /^\d{15,}$/.test(v)) return "<id>";
  if (Array.isArray(v)) return v.slice(0, 4).map(mask);
  if (v && typeof v === "object")
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mask(x)]));
  return v;
};
const rosters = (await spikeFetch(`${API}/league/${leagueId}/rosters`)).body as Record<
  string,
  unknown
>[];
console.log("roster[0]", JSON.stringify(mask(rosters[0])));
console.log(
  "waiver_position values",
  JSON.stringify(rosters.map((r) => (r.settings as Record<string, unknown>).waiver_position)),
);
console.log(
  "waiver_budget_used",
  JSON.stringify(rosters.map((r) => (r.settings as Record<string, unknown>).waiver_budget_used)),
);
console.log("roster keys", Object.keys(rosters[0] ?? {}).join(","));
console.log("settings keys", Object.keys(rosters[0]?.settings ?? {}).join(","));
console.log("co_owners", JSON.stringify(rosters.map((r) => r.co_owners)));
console.log("owner_id null count", rosters.filter((r) => r.owner_id === null).length);
console.log(
  "reserve non-null",
  rosters.filter((r) => r.reserve !== null).length,
  "taxi non-null",
  rosters.filter((r) => r.taxi !== null).length,
);
console.log("players len", JSON.stringify(rosters.map((r) => (r.players as string[]).length)));
console.log("starters len", JSON.stringify(rosters.map((r) => (r.starters as string[]).length)));
console.log(
  "starter '0' entries",
  rosters.flatMap((r) => (r.starters as string[]).filter((s) => s === "0")).length,
);

for (let w = 1; w <= 4; w++) {
  const tx = (await spikeFetch(`${API}/league/${leagueId}/transactions/${w}`)).body as Record<
    string,
    unknown
  >[];
  const seen = new Set<string>();
  for (const t of tx) {
    const key = `${String(t.type)}/${String(t.status)}`;
    if (seen.has(key) && !(t.type === "waiver" && w === 2)) continue;
    seen.add(key);
    console.log(`tx w${w} ${key}`, JSON.stringify(mask(t)));
  }
}
const all = [] as Record<string, unknown>[];
for (let w = 1; w <= 4; w++)
  all.push(
    ...((await spikeFetch(`${API}/league/${leagueId}/transactions/${w}`)).body as Record<
      string,
      unknown
    >[]),
  );
const waivers = all.filter((t) => t.type === "waiver");
console.log(
  "waiver settings samples",
  JSON.stringify(
    waivers.map((t) => ({
      s: t.status,
      st: t.settings,
      pr: t.priority,
      wb: t.waiver_budget,
      creator_same: true,
    })),
  ),
);
console.log("tx top keys union", [...new Set(all.flatMap((t) => Object.keys(t)))].join(","));
console.log(
  "failed has metadata?",
  JSON.stringify(
    waivers
      .filter((t) => t.status === "failed")
      .slice(0, 3)
      .map((t) => t.metadata),
  ),
);
console.log(
  "tx status_updated vs created sample",
  JSON.stringify(
    waivers
      .slice(0, 3)
      .map((t) => [t.created, t.status_updated, new Date(t.created as number).toISOString()]),
  ),
);
console.log(
  "free_agent created hour/ET samples",
  JSON.stringify(
    all
      .filter((t) => t.type === "free_agent")
      .slice(0, 3)
      .map((t) => new Date(t.created as number).toISOString()),
  ),
);
console.log("leg field vs week", JSON.stringify([...new Set(all.map((t) => t.leg))]));
