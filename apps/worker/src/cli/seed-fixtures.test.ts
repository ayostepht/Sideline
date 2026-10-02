import {
  dbPathFromDataDir,
  getActiveLeagueId,
  getSleeperUserId,
  getSleeperUsername,
  openDb,
  readUserLeagues,
} from "@sideline/db";
import { RateLimiter } from "@sideline/sleeper";
import { describe, expect, it } from "vitest";
import { tempDataDir } from "../testutil.js";
import { createFixtureFetch, readManifest } from "../fixture-fetch.js";
import { runSeed } from "./seed-fixtures.js";

const fast = (): RateLimiter => new RateLimiter({ ratePerSecond: 10_000, maxPerWindow: 1_000_000 });

describe("fixture fetch", () => {
  it("fails loudly with the URL for anything unrecorded", async () => {
    const f = createFixtureFetch();
    await expect(f("https://api.sleeper.app/v1/league/42/rosters")).rejects.toThrow(
      "https://api.sleeper.app/v1/league/42/rosters",
    );
    await expect(f("https://example.com/x")).rejects.toThrow("https://example.com/x");
  });
});

describe("db:seed:fixtures", () => {
  it("seeds every table with no network, and a second run changes zero rows", async () => {
    const dir = tempDataDir();
    const lines: string[] = [];
    const realFetch = globalThis.fetch;
    const code = await runSeed({
      env: { DATA_DIR: dir },
      out: (l) => lines.push(l),
      limiter: fast(),
    });
    expect(code).toBe(0);
    expect(globalThis.fetch).toBe(realFetch);
    const counts = new Map(
      lines
        .filter((l) => /^ {2}\w+: \d+$/.test(l))
        .map((l) => {
          const [k, v] = l.trim().split(": ");
          return [k, Number(v)] as const;
        }),
    );
    for (const t of ["players", "rosters", "matchups", "player_week_stats", "schedule"]) {
      expect(counts.get(t) ?? 0, t).toBeGreaterThan(0);
    }
    const second: string[] = [];
    expect(
      await runSeed({ env: { DATA_DIR: dir }, out: (l) => second.push(l), limiter: fast() }),
    ).toBe(0);
    const changed = second.filter((l) => / rows changed/.test(l));
    expect(changed.length).toBeGreaterThanOrEqual(10);
    for (const l of changed) expect(l, l).toContain(", 0 rows changed");
    const db = openDb(dbPathFromDataDir(dir));
    const runs = db.sqlite.prepare("SELECT COUNT(*) AS n FROM sync_runs").get() as { n: number };
    expect(runs.n).toBeGreaterThanOrEqual(22);
    db.sqlite.close();
  }, 60_000);

  it("stores the fixture identity, league choices and active league by default", async () => {
    const dir = tempDataDir();
    const m = readManifest();
    const lines: string[] = [];
    expect(
      await runSeed({ env: { DATA_DIR: dir }, out: (l) => lines.push(l), limiter: fast() }),
    ).toBe(0);
    const db = openDb(dbPathFromDataDir(dir));
    expect(getSleeperUsername(db)).toBe(m.username);
    expect(getSleeperUserId(db)).toBe(m.userId);
    expect(getActiveLeagueId(db)).toBe(m.leagueId);
    const ids = readUserLeagues(db, m.userId ?? "", Number(m.season)).map((l) => l.leagueId);
    expect(ids).toHaveLength(2);
    expect(ids).toContain(m.leagueId);
    db.sqlite.close();
    const second: string[] = [];
    await runSeed({ env: { DATA_DIR: dir }, out: (l) => second.push(l), limiter: fast() });
    expect(second.find((l) => l.startsWith("identity:"))).toContain(", 0 rows changed");
  }, 60_000);

  it("stays anonymous with noIdentity", async () => {
    const dir = tempDataDir();
    const m = readManifest();
    expect(
      await runSeed({
        env: { DATA_DIR: dir },
        out: () => undefined,
        limiter: fast(),
        noIdentity: true,
      }),
    ).toBe(0);
    const db = openDb(dbPathFromDataDir(dir));
    expect(getSleeperUsername(db)).toBeNull();
    expect(getSleeperUserId(db)).toBeNull();
    expect(getActiveLeagueId(db)).toBeNull();
    expect(readUserLeagues(db, m.userId ?? "")).toHaveLength(0);
    db.sqlite.close();
  }, 60_000);
});
