import { SYNC_CADENCE_MS } from "@sideline/shared";
import { describe, expect, it } from "vitest";
import { buildCadences, DEFAULT_CADENCES, dueJobs } from "./schedule.js";

const MIN = 60_000;
const now = new Date("2025-10-19T17:00:00Z");
const ago = (m: number): Date => new Date(now.getTime() - m * MIN);

describe("dueJobs", () => {
  it("a job that never ran is due, in run order", () => {
    const due = dueJobs(now, {}, DEFAULT_CADENCES, false);
    expect(due.slice(0, 3)).toEqual(["state", "league", "users"]);
    expect(due).not.toContain("backfill_2025");
  });
  it("respects default intervals", () => {
    const last = {
      state: ago(14),
      league: ago(61),
      rosters: ago(16),
      trending: ago(29),
      stats: ago(59),
    };
    const due = dueJobs(
      now,
      last,
      {
        ...DEFAULT_CADENCES,
        matchups: undefined,
        transactions: undefined,
        users: undefined,
        projections: undefined,
        players: undefined,
        nflverse: undefined,
      },
      false,
    );
    expect(due).toEqual(["league", "rosters"]);
  });
  it("speeds up rosters (5 min) and matchups (2 min) in game windows", () => {
    const last = { rosters: ago(6), matchups: ago(3), state: ago(6) };
    const cad = {
      rosters: DEFAULT_CADENCES.rosters,
      matchups: DEFAULT_CADENCES.matchups,
      state: DEFAULT_CADENCES.state,
    };
    expect(dueJobs(now, last, cad, true)).toEqual(["rosters", "matchups"]);
    expect(dueJobs(now, last, cad, false)).toEqual([]);
  });
  it("evaluates cron cadences in America/New_York", () => {
    const cad = { players: DEFAULT_CADENCES.players };
    // 04:30 EDT = 08:30Z. Last run yesterday 08:30Z; at 08:29Z today not due, at 08:30Z due.
    const last = { players: new Date("2025-10-18T08:30:00Z") };
    expect(dueJobs(new Date("2025-10-19T08:29:00Z"), last, cad, false)).toEqual([]);
    expect(dueJobs(new Date("2025-10-19T08:30:00Z"), last, cad, false)).toEqual(["players"]);
    // After the DST change 04:30 EST = 09:30Z.
    const l2 = { players: new Date("2025-11-02T09:30:00Z") };
    expect(dueJobs(new Date("2025-11-03T09:29:00Z"), l2, cad, false)).toEqual([]);
    expect(dueJobs(new Date("2025-11-03T09:30:00Z"), l2, cad, false)).toEqual(["players"]);
  });
  it("config cron overrides replace the default", () => {
    const cad = buildCadences({ stats: "*/10 * * * *", bogus: "* * * * *" });
    expect(cad.stats).toEqual({ cron: "*/10 * * * *" });
    const t = new Date("2025-10-19T17:10:00Z");
    expect(
      dueJobs(
        t,
        { stats: new Date("2025-10-19T17:00:00Z") },
        { stats: { cron: "*/10 * * * *" } },
        false,
      ),
    ).toEqual(["stats"]);
    expect(
      dueJobs(
        new Date("2025-10-19T17:09:00Z"),
        { stats: new Date("2025-10-19T17:00:00Z") },
        { stats: { cron: "*/10 * * * *" } },
        false,
      ),
    ).toEqual([]);
  });
});

describe("DEFAULT_CADENCES vs shared table", () => {
  it("interval cadences equal SYNC_CADENCE_MS", () => {
    for (const [job, c] of Object.entries(DEFAULT_CADENCES)) {
      if (c === undefined || "cron" in c) continue;
      expect(c.every, job).toBe(SYNC_CADENCE_MS[job as keyof typeof SYNC_CADENCE_MS]);
    }
  });
});
