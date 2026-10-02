import { readFileSync } from "node:fs";
import path from "node:path";

/** Synthetic 2025 tree: state, league, weeks 1-2 stats and projections (synthetic ids 9101-9103). */
export const synthetic2025Root = path.resolve(
  import.meta.dirname,
  "../fixtures/synthetic/sleeper-2025",
);

/** Reads and parses a JSON fixture relative to a fixture root (e.g. `stats/2025/1.json`). */
export function readFixtureJson(fixtureRoot: string, relativePath: string): unknown {
  return JSON.parse(readFileSync(path.join(fixtureRoot, relativePath), "utf8")) as unknown;
}
