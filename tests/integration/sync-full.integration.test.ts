import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ALL_ORDER } from "../../apps/worker/src/registry.js";
import { createSleeperServer, recordedFixtureRoot } from "../msw/server.js";
import {
  createNflverseMock,
  createOpenMeteoMock,
  createSyncHarness,
  EXPECTED_COUNTS,
  type NflverseMock,
  type SyncHarness,
} from "../helpers/sync-harness.js";

const server = createSleeperServer({ fixtureRoot: recordedFixtureRoot });
let nfl: NflverseMock;
let h: SyncHarness;

beforeAll(() => server.listen());
beforeEach(() => {
  nfl = createNflverseMock();
  server.use(nfl.handler, createOpenMeteoMock().handler);
  h = createSyncHarness();
});
afterEach(() => {
  h.cleanup();
  server.resetHandlers();
  server.mock.reset();
});
afterAll(() => server.close());

describe("T1.7b: full sync from recorded fixtures", () => {
  it("SYNC-1: every job in ALL_ORDER succeeds and fills each table with the known counts", async () => {
    const outcomes = await h.run();
    expect(outcomes.map((o) => o.job)).toEqual([...ALL_ORDER]);
    expect(outcomes.filter((o) => o.status === "failed")).toEqual([]);
    expect(h.counts()).toEqual(EXPECTED_COUNTS);
    expect(server.mock.unhandled).toEqual([]);
    expect(h.runs()).toHaveLength(ALL_ORDER.length);
  });

  it("SYNC-2: a second run changes nothing (same counts, rows_changed = 0 for every job)", async () => {
    await h.run();
    const first = h.counts();
    h.clearRuns();
    h.clock.advance(60_000);
    const outcomes = await h.run();
    expect(h.counts()).toEqual(first);
    expect(outcomes.filter((o) => o.status === "failed")).toEqual([]);
    const runs = h.runs();
    expect(runs).toHaveLength(ALL_ORDER.length);
    expect(runs.map((r) => ({ job: r.job, rows: r.rows_changed }))).toEqual(
      ALL_ORDER.map((job) => ({ job, rows: 0 })),
    );
    expect(server.mock.unhandled).toEqual([]);
  });
});
