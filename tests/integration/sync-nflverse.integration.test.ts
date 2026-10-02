import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSleeperServer, recordedFixtureRoot } from "../msw/server.js";
import {
  createNflverseMock,
  createSyncHarness,
  EXPECTED_COUNTS,
  gamesCsv,
  type NflverseMock,
  type SyncHarness,
} from "../helpers/sync-harness.js";
import type { SyncJobName } from "../../packages/shared/src/index.js";
import { ALL_ORDER } from "../../apps/worker/src/registry.js";

const server = createSleeperServer({ fixtureRoot: recordedFixtureRoot });
let nfl: NflverseMock;
let h: SyncHarness | undefined;

beforeAll(() => server.listen());
beforeEach(() => {
  nfl = createNflverseMock();
  server.use(nfl.handler);
});
afterEach(() => {
  h?.cleanup();
  h = undefined;
  server.resetHandlers();
  server.mock.reset();
});
afterAll(() => server.close());

function othersOk(outcomes: { job: SyncJobName; status: string }[]): void {
  expect(outcomes.filter((o) => o.job !== "nflverse").map((o) => o.status)).not.toContain("failed");
  expect(outcomes.map((o) => o.job)).toEqual([...ALL_ORDER]);
}

interface Kickoff {
  game_id: string;
  kickoff_utc: string | null;
  kickoff_approximate: number;
}
const GAME = "2026_01_NE_SEA";
function kickoff(sync: SyncHarness): Kickoff {
  return sync.tmp.handle.sqlite
    .prepare("SELECT game_id, kickoff_utc, kickoff_approximate FROM schedule WHERE game_id = ?")
    .get(GAME) as Kickoff;
}

describe("T1.7b: nflverse degradation and kickoff upgrade", () => {
  it("NFLVERSE-1a: ENABLE_NFLVERSE=false skips the job, makes no nflverse request, other jobs succeed", async () => {
    h = createSyncHarness({ ENABLE_NFLVERSE: "false" });
    const outcomes = await h.run();
    othersOk(outcomes);
    const nflverse = outcomes.find((o) => o.job === "nflverse");
    expect(nflverse).toMatchObject({ status: "skipped", rowsChanged: 0, callsMade: 0 });
    expect(nfl.requests).toEqual([]);
    expect(h.count("schedule")).toBe(0);
    expect(h.count("players")).toBe(EXPECTED_COUNTS.players);
    expect(h.runs().find((r) => r.job === "nflverse")?.status).toBe("skipped");
  });

  it("NFLVERSE-1b: a 500 from the nflverse download degrades the job; the others succeed", async () => {
    h = createSyncHarness();
    nfl.setStatus(500);
    const outcomes = await h.run();
    othersOk(outcomes);
    expect(outcomes.find((o) => o.job === "nflverse")?.status).toBe("skipped");
    expect(nfl.requests.length).toBeGreaterThan(0);
    expect(h.count("schedule")).toBe(0);
    expect(h.count("matchups")).toBe(EXPECTED_COUNTS.matchups);
  });

  it("NFLVERSE-1c: an approximate kickoff is replaced by the real gametime on a later run", async () => {
    h = createSyncHarness();
    nfl.setGamesCsv(gamesCsv({ blankGametime: true }));
    await h.run(["state", "nflverse"]);
    // Wednesday game with no gametime: ADR-002 fallback is 20:00 ET (00:00 UTC next day).
    expect(kickoff(h)).toEqual({
      game_id: GAME,
      kickoff_utc: "2026-09-10T00:00:00.000Z",
      kickoff_approximate: 1,
    });
    nfl.setGamesCsv(gamesCsv({ blankGametime: false }));
    h.clock.advance(25 * 60 * 60 * 1000); // past the provider's 24 h asset cache
    const outcomes = await h.run(["state", "nflverse"]);
    expect(outcomes.find((o) => o.job === "nflverse")?.rowsChanged).toBeGreaterThan(0);
    // Real gametime 20:20 ET.
    expect(kickoff(h)).toEqual({
      game_id: GAME,
      kickoff_utc: "2026-09-10T00:20:00.000Z",
      kickoff_approximate: 0,
    });
    const stillApprox = h.tmp.handle.sqlite
      .prepare("SELECT COUNT(*) AS n FROM schedule WHERE kickoff_approximate = 1")
      .get() as { n: number };
    expect(stillApprox.n).toBe(0);
  });
});
