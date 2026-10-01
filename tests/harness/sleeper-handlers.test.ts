import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fixturePathFor, withDelay, withStatus } from "../msw/sleeper-handlers";
import { createSleeperServer, syntheticFixtureRoot } from "../msw/server";

const BASE = "https://api.sleeper.app";
const LEAGUE = "100000000000000001";

const server = createSleeperServer({ fixtureRoot: syntheticFixtureRoot });

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  server.mock.reset();
});
afterAll(() => server.close());

function fixture(relative: string): unknown {
  return JSON.parse(readFileSync(path.join(syntheticFixtureRoot, relative), "utf8")) as unknown;
}

describe("HARNESS-1: fixture handlers serve the layout contract", () => {
  const cases: Array<[string, string]> = [
    ["/v1/state/nfl", "v1/state/nfl.json"],
    [`/v1/league/${LEAGUE}`, `v1/league/${LEAGUE}.json`],
    [`/v1/league/${LEAGUE}/users`, `v1/league/${LEAGUE}/users.json`],
    [`/v1/league/${LEAGUE}/rosters`, `v1/league/${LEAGUE}/rosters.json`],
    [`/v1/league/${LEAGUE}/matchups/1`, `v1/league/${LEAGUE}/matchups/1.json`],
    [`/v1/league/${LEAGUE}/transactions/1`, `v1/league/${LEAGUE}/transactions/1.json`],
    ["/v1/players/nfl", "v1/players/nfl.json"],
    ["/v1/players/nfl/trending/add", "v1/players/nfl/trending/add.json"],
    ["/projections/nfl/2026/1", "projections/2026/1.json"],
    ["/stats/nfl/2026/1", "stats/2026/1.json"],
  ];

  it.each(cases)("serves %s from %s", async (urlPath, file) => {
    const res = await fetch(`${BASE}${urlPath}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual(fixture(file));
    expect(server.mock.unhandled).toEqual([]);
  });

  it("ignores query strings", async () => {
    const res = await fetch(
      `${BASE}/projections/nfl/2026/1?season_type=regular&position[]=QB&order_by=ppr`,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(fixture("projections/2026/1.json"));
    expect(server.mock.requests).toEqual(["/projections/nfl/2026/1"]);
  });

  it("serves an empty-transactions fixture as an empty array", async () => {
    const res = await fetch(`${BASE}/v1/league/${LEAGUE}/transactions/1`);
    expect(await res.json()).toEqual([]);
  });
});

describe("HARNESS-2: unknown paths return 404 and are recorded", () => {
  it("returns 404 JSON and records the path without its query string", async () => {
    const res = await fetch(`${BASE}/v1/league/999/users?x=1`);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toMatchObject({ error: "no fixture", path: "/v1/league/999/users" });
    expect(server.mock.unhandled).toEqual(["/v1/league/999/users"]);
  });

  it("records paths outside the fixture layout", async () => {
    const res = await fetch(`${BASE}/avatars/abc`);
    expect(res.status).toBe(404);
    expect(server.mock.unhandled).toEqual(["/avatars/abc"]);
  });

  it("reset clears the recorded lists", async () => {
    await fetch(`${BASE}/v1/nope`);
    expect(server.mock.unhandled).toHaveLength(1);
    server.mock.reset();
    expect(server.mock.unhandled).toHaveLength(0);
    expect(server.mock.requests).toHaveLength(0);
  });

  it("fails requests to hosts that are not mocked (no real network)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(fetch("https://example.invalid/anything")).rejects.toThrow();
      // The failure must come from MSW refusing the request, not from a DNS miss.
      expect(spy.mock.calls.flat().join(" ")).toContain("without a matching request handler");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("HARNESS-3: failure injection", () => {
  it("withStatus returns 500 N times, then recovers to the fixture", async () => {
    server.use(withStatus("/v1/state/nfl", 500, 2));
    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      statuses.push((await fetch(`${BASE}/v1/state/nfl`)).status);
    }
    expect(statuses).toEqual([500, 500, 200, 200]);
  });

  it("withStatus without times fails every call", async () => {
    server.use(withStatus("/v1/state/nfl", 503));
    for (let i = 0; i < 3; i += 1) {
      expect((await fetch(`${BASE}/v1/state/nfl`)).status).toBe(503);
    }
  });

  it("withStatus 429 carries the Retry-After header", async () => {
    server.use(withStatus("/v1/state/nfl", 429, 1, { headers: { "Retry-After": "2" } }));
    const limited = await fetch(`${BASE}/v1/state/nfl`);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("2");
    const recovered = await fetch(`${BASE}/v1/state/nfl`);
    expect(recovered.status).toBe(200);
    expect(recovered.headers.get("retry-after")).toBeNull();
  });

  it("withStatus supports path params", async () => {
    server.use(withStatus("/v1/league/:id/users", 500, 1));
    expect((await fetch(`${BASE}/v1/league/${LEAGUE}/users`)).status).toBe(500);
    expect((await fetch(`${BASE}/v1/league/${LEAGUE}/users`)).status).toBe(200);
  });

  it("withDelay delays the first N calls and still serves the fixture", async () => {
    server.use(withDelay("/v1/state/nfl", 150, 1));
    const start = performance.now();
    const first = await fetch(`${BASE}/v1/state/nfl`);
    const firstMs = performance.now() - start;
    expect(first.status).toBe(200);
    expect(firstMs).toBeGreaterThanOrEqual(140);
    expect(await first.json()).toEqual(fixture("v1/state/nfl.json"));

    const secondStart = performance.now();
    await fetch(`${BASE}/v1/state/nfl`);
    expect(performance.now() - secondStart).toBeLessThan(140);
  });
});

describe("HARNESS-4: fixture path mapping", () => {
  const root = "/fx";
  it("maps v1, projections and stats paths", () => {
    expect(fixturePathFor(root, "/v1/state/nfl")).toBe("/fx/v1/state/nfl.json");
    expect(fixturePathFor(root, "/projections/nfl/2026/3")).toBe("/fx/projections/2026/3.json");
    expect(fixturePathFor(root, "/stats/nfl/2026/3")).toBe("/fx/stats/2026/3.json");
  });

  it("rejects unmappable and traversal-style paths", () => {
    expect(fixturePathFor(root, "/")).toBeNull();
    expect(fixturePathFor(root, "/v1")).toBeNull();
    expect(fixturePathFor(root, "/projections/nfl/2026")).toBeNull();
    expect(fixturePathFor(root, "/v1/../secret")).toBeNull();
    expect(fixturePathFor(root, "/v1/a%2Fb")).toBeNull();
    expect(fixturePathFor(root, "/other/x")).toBeNull();
  });
});

describe("HARNESS-5: synthetic manifest matches the contract", () => {
  it("has leagueId, season, weeks, partialWeeks, recordedAt", () => {
    const m = fixture("manifest.json") as Record<string, unknown>;
    expect(Object.keys(m).sort()).toEqual([
      "leagueId",
      "partialWeeks",
      "recordedAt",
      "season",
      "weeks",
    ]);
    expect(m["weeks"]).toEqual([1]);
    expect(m["partialWeeks"]).toEqual([]);
  });
});
