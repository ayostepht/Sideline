/** Spike phase 1: identity, league, state. Prints key shapes (no raw dumps). */
import { API, loadEnv, spikeFetch, callCount } from "./http.js";

const { username, leagueId } = loadEnv();

const state = await spikeFetch(`${API}/state/nfl`);
console.log("state", state.status, state.elapsedMs, "ms", JSON.stringify(state.body));
console.log("headers", JSON.stringify(state.headers));

const user = await spikeFetch(`${API}/user/${encodeURIComponent(username)}`);
const userObj = user.body as Record<string, unknown> | null;
console.log("user", user.status, userObj ? Object.keys(userObj) : null);
const userId = typeof userObj?.user_id === "string" ? userObj.user_id : "";

const leagues = await spikeFetch(`${API}/user/${userId}/leagues/nfl/2026`);
console.log(
  "leagues",
  leagues.status,
  Array.isArray(leagues.body) ? leagues.body.length : leagues.body,
);

for (const p of [
  "",
  "/users",
  "/rosters",
  "/traded_picks",
  "/winners_bracket",
  "/losers_bracket",
  "/drafts",
]) {
  const r = await spikeFetch(`${API}/league/${leagueId}${p}`);
  console.log(
    "league" + (p || "(root)"),
    r.status,
    r.bytes,
    "bytes",
    Array.isArray(r.body) ? `array(${r.body.length})` : typeof r.body,
  );
}
console.log("calls so far", callCount());
