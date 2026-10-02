import { existsSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  RawStatRowSchema,
  RawStateSchema,
  RawLeagueSchema,
} from "../../packages/sleeper/src/index.js";
import { isMigrated } from "../../packages/db/src/index.js";
import { readFixtureJson, synthetic2025Root } from "../helpers/fixtures.js";
import { createTempDb, type TempDb } from "../helpers/temp-db.js";
import { createSleeperServer } from "../msw/server.js";

const BASE = "https://api.sleeper.app";
const server = createSleeperServer({ fixtureRoot: synthetic2025Root });

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  server.mock.reset();
});
afterAll(() => server.close());

describe("T1.7a harness: temp SQLite", () => {
  it("HARNESS-1: temp DB is migrated, empty, and removed on cleanup", () => {
    const tmp: TempDb = createTempDb();
    try {
      expect(existsSync(tmp.dbPath)).toBe(true);
      expect(isMigrated(tmp.handle)).toBe(true);
      const tables = tmp.handle.sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_\\_%' ESCAPE '\\'",
        )
        .all() as { name: string }[];
      expect(tables.length).toBeGreaterThan(0);
      for (const { name } of tables) {
        const row = tmp.handle.sqlite.prepare(`SELECT count(*) AS n FROM "${name}"`).get() as {
          n: number;
        };
        expect({ table: name, rows: row.n }).toEqual({ table: name, rows: 0 });
      }
    } finally {
      tmp.cleanup();
    }
    expect(existsSync(tmp.dataDir)).toBe(false);
    tmp.cleanup(); // idempotent
  });

  it("HARNESS-2: each call gets its own DATA_DIR", () => {
    const a = createTempDb();
    const b = createTempDb();
    try {
      expect(a.dataDir).not.toBe(b.dataDir);
    } finally {
      a.cleanup();
      b.cleanup();
    }
  });
});

describe("T1.7a harness: MSW Sleeper handlers", () => {
  it("HARNESS-3: state and league fixtures are served and parse", async () => {
    const state = RawStateSchema.parse(await (await fetch(`${BASE}/v1/state/nfl`)).json());
    expect(state.season).toBe("2025");
    const league = RawLeagueSchema.parse(
      await (await fetch(`${BASE}/v1/league/100000000000000002`)).json(),
    );
    expect(league.league_id).toBe("100000000000000002");
    expect(server.mock.unhandled).toEqual([]);
  });

  it("HARNESS-4: synthetic 2025 weekly stats and projections parse with the sleeper schemas", async () => {
    for (const kind of ["stats", "projections"] as const) {
      for (const week of [1, 2]) {
        const res = await fetch(`${BASE}/${kind}/nfl/2025/${week}?season_type=regular`);
        expect(res.status).toBe(200);
        const rows = (await res.json()) as unknown[];
        expect(rows.length).toBe(3);
        for (const row of rows) {
          const parsed = RawStatRowSchema.parse(row);
          expect(parsed.player_id).toMatch(/^91\d\d$/);
        }
      }
    }
    // Same files read straight from disk agree with what the handler served.
    expect(readFixtureJson(synthetic2025Root, "stats/2025/1.json")).toHaveLength(3);
    expect(server.mock.unhandled).toEqual([]);
  });

  it("HARNESS-5: unknown endpoint is a recorded 404", async () => {
    const res = await fetch(`${BASE}/v1/state/other`);
    expect(res.status).toBe(404);
    expect(server.mock.unhandled).toEqual(["/v1/state/other"]);
  });
});
