/** Print league settings/scoring/roster positions from cache (no names/ids). */
import { API, loadEnv, spikeFetch } from "./http.js";

const { leagueId } = loadEnv();
const r = await spikeFetch(`${API}/league/${leagueId}`);
const l = r.body as Record<string, unknown>;
const out: Record<string, unknown> = {};
for (const [k, v] of Object.entries(l)) {
  if (
    [
      "name",
      "avatar",
      "league_id",
      "creator_id",
      "owner_id",
      "draft_id",
      "previous_league_id",
      "metadata",
    ].includes(k)
  ) {
    out[k] =
      k === "metadata"
        ? Object.keys(v ?? {})
        : `<${typeof v}${v === null ? ":null" : ""}${typeof v === "string" ? `:len${v.length}` : ""}>`;
  } else out[k] = v;
}
console.log(JSON.stringify(out, null, 1));
console.log("headers", JSON.stringify(r.headers));
const u = await spikeFetch(`${API}/league/${leagueId}/users`);
const first = (u.body as Record<string, unknown>[])[0] ?? {};
console.log(
  "users[0] keys",
  Object.keys(first),
  "metadata keys",
  Object.keys(first.metadata ?? {}),
);
for (const x of u.body as Record<string, unknown>[]) {
  const md = (x.metadata ?? {}) as Record<string, unknown>;
  console.log(
    "team_name present:",
    typeof md.team_name,
    "avatar:",
    x.avatar === null ? "null" : typeof x.avatar,
    "is_owner",
    x.is_owner,
    "is_bot",
    x.is_bot,
  );
}
