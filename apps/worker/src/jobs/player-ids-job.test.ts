import { upsertPlayers } from "@sideline/db";
import type { Player } from "@sideline/shared";
import { createCallCounter, RateLimiter } from "@sideline/sleeper";
import { describe, expect, it } from "vitest";
import { createFixtureFetch } from "../fixture-fetch.js";
import { createJobRegistry, ALL_ORDER } from "../registry.js";
import { fakeClock, silent, tempDataDir, tempDb, testConfig } from "../testutil.js";
import type { JobContext } from "../types.js";
import { playerIdsJob } from "./player-ids-job.js";
import { registeredJobs } from "./index.js";

const NOW = "2026-10-07T12:00:00Z";
const CSV = "sleeper_id,espn_id,name\n1,11,A\n2,22,B\n3,33,C\n";

function player(id: string, espnId: string | null): Player {
  return {
    playerId: id,
    fullName: `Player ${id}`,
    firstName: null,
    lastName: null,
    position: "WR",
    fantasyPositions: ["WR"],
    team: "KC",
    status: null,
    injuryStatus: null,
    injuryBodyPart: null,
    active: true,
    age: null,
    yearsExp: null,
    depthChartOrder: null,
    searchRank: null,
    gsisId: null,
    espnId,
  };
}

function setup(players: Player[]) {
  const dir = tempDataDir();
  const db = tempDb(dir);
  const clock = fakeClock(NOW);
  if (players.length > 0) upsertPlayers(db, players, NOW);
  const ctx = (): JobContext => ({
    db,
    limiter: new RateLimiter(),
    counter: createCallCounter(),
    now: clock.now,
    logger: silent,
    config: testConfig(dir),
    signal: new AbortController().signal,
  });
  const espn = (id: string) =>
    (
      db.sqlite.prepare("SELECT espn_id AS e FROM players WHERE player_id = ?").get(id) as {
        e: string | null;
      }
    ).e;
  return { db, ctx, espn };
}

const csvFetch: typeof fetch = () => Promise.resolve(new Response(CSV, { status: 200 }));

describe("NEWS-IDS-3 player_ids job", () => {
  it("fills only missing ids, reports the count, and fills 0 on the second run", async () => {
    const s = setup([player("1", null), player("2", "99"), player("3", null), player("4", null)]);
    const job = playerIdsJob({ fetch: csvFetch });
    const first = await job.run(s.ctx());
    expect(first.rowsChanged).toBe(2);
    expect(first.note).toBe("filled 2 of 3 missing espn ids");
    expect(s.espn("1")).toBe("11");
    expect(s.espn("2")).toBe("99");
    expect(s.espn("4")).toBeNull();
    const second = await job.run(s.ctx());
    expect(second.rowsChanged).toBe(0);
  });

  it("skips with a degraded note when the crosswalk is unavailable", async () => {
    const s = setup([player("1", null)]);
    const job = playerIdsJob({ fetch: () => Promise.resolve(new Response("no", { status: 404 })) });
    const res = await job.run(s.ctx());
    expect(res.status).toBe("skipped");
    expect(res.rowsChanged).toBe(0);
    expect(res.note).toMatch(/^degraded/);
    expect(s.espn("1")).toBeNull();
  });

  it("skips and never throws when the fetch throws (fixture mode has no crosswalk)", async () => {
    const s = setup([player("1", null)]);
    const res = await playerIdsJob({ fetch: createFixtureFetch() }).run(s.ctx());
    expect(res.status).toBe("skipped");
    expect(res.note).toMatch(/^degraded/);
  });

  it("skips when no players are stored, without fetching", async () => {
    const s = setup([]);
    let calls = 0;
    const res = await playerIdsJob({
      fetch: () => {
        calls++;
        return Promise.resolve(new Response(CSV));
      },
    }).run(s.ctx());
    expect(res.status).toBe("skipped");
    expect(calls).toBe(0);
  });

  it("is registered once and runs after players and before player_news in all", () => {
    expect(registeredJobs.filter((j) => j.name === "player_ids")).toHaveLength(1);
    const all = createJobRegistry(registeredJobs).allInOrder();
    expect(all.indexOf("player_ids")).toBeGreaterThan(all.indexOf("players"));
    expect(all.indexOf("player_ids")).toBeLessThan(all.indexOf("player_news"));
    expect(ALL_ORDER).toContain("player_ids");
  });
});
