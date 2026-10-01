/** Spike phase 5: misc behaviours (HEAD checks, conditional GET, 404/empty cases, brackets, future matchups). */
import { API, API_ROOT, callCount, loadEnv, spikeFetch } from "./http.js";

const { leagueId } = loadEnv();

// Headshot and avatar patterns (HEAD)
const head = await spikeFetch("https://sleepercdn.com/content/nfl/players/thumb/4881.jpg", {
  method: "HEAD",
});
console.log(
  "headshot HEAD",
  head.status,
  head.headers["content-type"],
  head.headers["content-length"],
  head.headers["cache-control"],
);
const headTeam = await spikeFetch("https://sleepercdn.com/images/team_logos/nfl/atl.png", {
  method: "HEAD",
});
console.log("team logo HEAD (guess pattern)", headTeam.status, headTeam.headers["content-type"]);
const users = (await spikeFetch(`${API}/league/${leagueId}/users`)).body as {
  avatar: string | null;
}[];
const avatarId = users.find((u) => u.avatar)?.avatar;
if (avatarId) {
  const a = await spikeFetch(`https://sleepercdn.com/avatars/thumbs/${avatarId}`, {
    method: "HEAD",
  });
  console.log(
    "avatar thumb HEAD",
    a.status,
    a.headers["content-type"],
    a.headers["content-length"],
  );
}

// Conditional GET with ETag
const first = await spikeFetch(`${API}/state/nfl`, { refresh: true });
const etag = first.headers.etag;
console.log("state etag present", Boolean(etag), "status", first.status);
if (etag) {
  const cond = await spikeFetch(`${API}/state/nfl`, { headers: { "If-None-Match": etag } });
  console.log("conditional GET status", cond.status, "bytes", cond.bytes);
}

// Not-found behaviours with obviously fake ids
const cases = [
  `${API}/user/this_user_does_not_exist_zz9`,
  `${API}/league/1000000000000000001`,
  `${API}/league/1000000000000000001/rosters`,
  `${API}/league/${leagueId}/matchups/0`,
  `${API}/league/${leagueId}/matchups/30`,
  `${API}/league/${leagueId}/transactions/12`,
  `${API}/draft/1000000000000000001/picks`,
];
for (const url of cases) {
  const r = await spikeFetch(url);
  console.log(
    "probe",
    url.replace(leagueId, "<league>"),
    r.status,
    r.bytes,
    "bytes",
    JSON.stringify(r.rawText.slice(0, 80)),
  );
}
// Unknown projections season / week outside range
for (const url of [
  `${API_ROOT}/projections/nfl/2026/25?season_type=regular`,
  `${API_ROOT}/projections/nfl/2026/4`,
]) {
  const r = await spikeFetch(url);
  const rows = Array.isArray(r.body) ? (r.body as unknown[]) : [];
  console.log(
    "probe",
    url,
    r.status,
    Array.isArray(r.body) ? `array(${rows.length})` : JSON.stringify(r.rawText.slice(0, 80)),
  );
}
console.log("calls so far", callCount());
