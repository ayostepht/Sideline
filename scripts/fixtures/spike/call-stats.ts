/** Summarize the spike call log (total, per-minute max, players/nfl count) and response times from cache. */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CACHE_DIR } from "./http.js";

const lines = readFileSync(join(CACHE_DIR, "calls.jsonl"), "utf8").split("\n").filter(Boolean);
const calls = lines.map(
  (l) => JSON.parse(l) as { t: string; method: string; url: string; status: number },
);
const times = calls.map((c) => Date.parse(c.t)).sort((a, b) => a - b);
let maxPerMin = 0;
for (let i = 0; i < times.length; i++) {
  let n = 0;
  for (let j = i; j < times.length && (times[j] ?? 0) - (times[i] ?? 0) < 60_000; j++) n++;
  maxPerMin = Math.max(maxPerMin, n);
}
let minGap = Infinity;
for (let i = 1; i < times.length; i++)
  minGap = Math.min(minGap, (times[i] ?? 0) - (times[i - 1] ?? 0));
console.log("total calls", calls.length, "max in any 60s window", maxPerMin, "min gap ms", minGap);
console.log(
  "players/nfl GETs",
  calls.filter((c) => c.method === "GET" && /\/players\/nfl$/.test(c.url)).length,
);
console.log(
  "by method",
  JSON.stringify(
    calls.reduce<Record<string, number>>(
      (a, c) => ({ ...a, [c.method]: (a[c.method] ?? 0) + 1 }),
      {},
    ),
  ),
);
console.log(
  "non-200 statuses",
  JSON.stringify(calls.filter((c) => c.status !== 200).map((c) => c.status)),
);
const ms = new Map<string, number[]>();
for (const f of readdirSync(CACHE_DIR).filter((x) => x.endsWith(".json"))) {
  const e = JSON.parse(readFileSync(join(CACHE_DIR, f), "utf8")) as {
    url: string;
    elapsedMs: number;
    bytes: number;
  };
  const key =
    e.url
      .replace(/https:\/\/[^/]+/, "")
      .replace(/\/\d{10,}/g, "/<id>")
      .replace(/\/[a-z0-9_]{3,40}$/i, (m) => (/^\/(nfl|state|users|rosters)/.test(m) ? m : m))
      .split("?")[0] ?? "";
  const bucket = key
    .replace(/\/\d+(?=\/|$)/g, "/<n>")
    .replace(/\/user\/[^/]+/, "/user/<x>")
    .replace(/\/league\/<id>/, "/league/<id>");
  ms.set(bucket, [...(ms.get(bucket) ?? []), e.elapsedMs]);
}
for (const [k, v] of [...ms].sort())
  console.log(k, "n=" + v.length, "median ms", v.sort((a, b) => a - b)[Math.floor(v.length / 2)]);
