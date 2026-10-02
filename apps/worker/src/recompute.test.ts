import { describe, expect, it } from "vitest";
import { createRecomputeRegistry } from "./recompute.js";
import { createJobRegistry } from "./registry.js";
import { runJobs } from "./runner.js";
import { fakeClock, silent, tempDb, testConfig, tempDataDir } from "./testutil.js";
import type { Job } from "./types.js";
import { RateLimiter } from "@sideline/sleeper";
import type { SyncJobName } from "@sideline/shared";

function job(name: SyncJobName, rowsChanged: number): Job {
  return { name, run: () => Promise.resolve({ rowsChanged }) };
}

function deps(recompute: ReturnType<typeof createRecomputeRegistry>) {
  const dir = tempDataDir();
  return {
    db: tempDb(dir),
    limiter: new RateLimiter({ ratePerSecond: 10_000, maxPerWindow: 1_000_000 }),
    logger: silent,
    config: testConfig(dir),
    now: fakeClock("2026-10-01T12:00:00Z").now,
    signal: () => new AbortController().signal,
    recompute,
  };
}

describe("T1.5c recompute hooks", () => {
  it("calls a registered hook with the db and the changed tables", async () => {
    const reg = createRecomputeRegistry();
    const seen: string[][] = [];
    reg.register((_db, tables) => {
      seen.push([...tables].sort());
    });
    const d = deps(reg);
    const registry = createJobRegistry([job("stats", 3), job("players", 0), job("nflverse", 2)]);
    await runJobs(d, registry, ["stats", "players", "nflverse"]);
    expect(seen).toEqual([["player_week_stats", "schedule"]]);
  });

  it("calls nothing when no rows changed", async () => {
    const reg = createRecomputeRegistry();
    let calls = 0;
    reg.register(() => {
      calls += 1;
    });
    await runJobs(deps(reg), createJobRegistry([job("stats", 0)]), ["stats"]);
    expect(calls).toBe(0);
  });

  it("a throwing hook is logged and does not fail the run or block later hooks", async () => {
    const reg = createRecomputeRegistry();
    let later = 0;
    reg.register(() => {
      throw new Error("boom");
    });
    reg.register(async () => {
      await Promise.resolve();
      later += 1;
    });
    const out = await runJobs(deps(reg), createJobRegistry([job("stats", 1)]), ["stats"]);
    expect(out[0]).toMatchObject({ status: "success", rowsChanged: 1 });
    expect(later).toBe(1);
  });

  it("starts empty and register returns an unregister function", () => {
    const reg = createRecomputeRegistry();
    expect(reg.size()).toBe(0);
    const off = reg.register(() => undefined);
    expect(reg.size()).toBe(1);
    off();
    expect(reg.size()).toBe(0);
  });
});
