import { describe, expect, it } from "vitest";
import {
  RawLeagueSchema,
  RawLeagueUserSchema,
  RawMatchupSchema,
  RawRosterSchema,
  RawStateSchema,
  RawStatRowSchema,
  RawTransactionSchema,
  RawTrendingSchema,
} from "../../packages/sleeper/src/index.js";
import { readEnvValue } from "../helpers/env.js";

/**
 * Live contract suite (`pnpm test:contract`, manual or gate-only, never in CI). Calls the live
 * Sleeper API directly with plain fetch (NOT the shared rate limiter), about 20 calls per run.
 * `/players/nfl` lives in players.contract.test.ts behind CONTRACT_PLAYERS=1 (once per day max).
 * Validates response SHAPES against the zod schemas only: no value assertions on league data,
 * nothing is written to disk, nothing is logged. The league id comes from DEFAULT_LEAGUE_ID
 * (process env or gitignored .env).
 */
const API = "https://api.sleeper.app";
const leagueId = readEnvValue("DEFAULT_LEAGUE_ID");

if (leagueId === undefined) {
  // Fail loudly before any test or network call; a silent exit 0 would hide an unrun suite.
  throw new Error("DEFAULT_LEAGUE_ID is not set; the contract suite needs it (see .env.example)");
}

async function getJson(pathAndQuery: string): Promise<unknown> {
  const res = await fetch(`${API}${pathAndQuery}`, { headers: { accept: "application/json" } });
  expect(res.status, `GET ${pathAndQuery.replace(/\d{12,}/g, ":id")}`).toBe(200);
  const body: unknown = await res.json();
  return body;
}

/** Every element must parse; reports the count only, never the data. */
function expectAllParse(schema: { safeParse(v: unknown): { success: boolean } }, rows: unknown) {
  expect(Array.isArray(rows)).toBe(true);
  const bad = (rows as unknown[]).filter((r) => !schema.safeParse(r).success).length;
  expect(bad, "rows failing schema").toBe(0);
}

describe("contract: Sleeper public API shapes", () => {
  it("CONTRACT-1: /v1/state/nfl matches RawStateSchema", async () => {
    RawStateSchema.parse(await getJson("/v1/state/nfl"));
  });

  it("CONTRACT-2: /v1/players/nfl/trending/add matches RawTrendingSchema", async () => {
    RawTrendingSchema.parse(await getJson("/v1/players/nfl/trending/add?limit=5"));
  });
});

describe("contract: league endpoints (DEFAULT_LEAGUE_ID)", () => {
  const id = leagueId;

  it("CONTRACT-4: league, users, rosters match their schemas", async () => {
    RawLeagueSchema.parse(await getJson(`/v1/league/${id}`));
    expectAllParse(RawLeagueUserSchema, await getJson(`/v1/league/${id}/users`));
    expectAllParse(RawRosterSchema, await getJson(`/v1/league/${id}/rosters`));
  });

  it("CONTRACT-5: matchups and transactions match their schemas", async () => {
    const state = RawStateSchema.parse(await getJson("/v1/state/nfl"));
    const week = Math.max(1, state.week);
    expectAllParse(RawMatchupSchema, await getJson(`/v1/league/${id}/matchups/${week}`));
    expectAllParse(RawTransactionSchema, await getJson(`/v1/league/${id}/transactions/${week}`));
  });

  it("CONTRACT-6: weekly stats and projections rows match RawStatRowSchema", async () => {
    const state = RawStateSchema.parse(await getJson("/v1/state/nfl"));
    const season = state.season;
    for (const kind of ["stats", "projections"]) {
      const rows = await getJson(`/${kind}/nfl/${season}/1?season_type=regular`);
      expectAllParse(RawStatRowSchema, rows);
    }
  });
});
