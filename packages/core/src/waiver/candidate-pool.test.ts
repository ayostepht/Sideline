import type { Player } from "@sideline/shared";
import { describe, expect, it } from "vitest";
import { ACTIVE_PLAYER_STATUS, buildCandidatePool } from "./candidate-pool.js";

function player(overrides: Partial<Player> & { playerId: string }): Player {
  return {
    fullName: `Player ${overrides.playerId}`,
    firstName: null,
    lastName: null,
    position: "WR",
    fantasyPositions: ["WR"],
    team: "SEA",
    status: ACTIVE_PLAYER_STATUS,
    injuryStatus: null,
    injuryBodyPart: null,
    active: true,
    age: null,
    yearsExp: null,
    depthChartOrder: null,
    searchRank: null,
    gsisId: null,
    ...overrides,
  };
}

describe("buildCandidatePool (WAIVER-1)", () => {
  const eligiblePositions = new Set(["QB", "RB", "WR", "TE", "K", "DEF"]);

  it("excludes a player rostered on a normal roster slot", () => {
    const players = [player({ playerId: "1" }), player({ playerId: "2" })];
    const result = buildCandidatePool({
      players,
      rosteredPlayerIds: new Set(["1"]),
      eligiblePositions,
    });
    expect(result.candidates.map((p) => p.playerId)).toEqual(["2"]);
    expect(result.reasons.find((r) => r.code === "EXCLUDED_ROSTERED")?.value).toBe(1);
  });

  it("excludes a player who is only rostered via IR or taxi (same rosteredPlayerIds set)", () => {
    // The caller is documented to fold IR/taxi membership into `rosteredPlayerIds`; from this
    // module's point of view there is no distinction, so a player on IR must still be excluded.
    const players = [player({ playerId: "ir-1" })];
    const result = buildCandidatePool({
      players,
      rosteredPlayerIds: new Set(["ir-1"]),
      eligiblePositions,
    });
    expect(result.candidates).toHaveLength(0);
  });

  it("excludes a player whose status is not Active", () => {
    const players = [
      player({ playerId: "inactive-1", status: "Inactive" }),
      player({ playerId: "ps-1", status: "Practice Squad" }),
      player({ playerId: "null-status", status: null }),
      player({ playerId: "active-1", status: "Active" }),
    ];
    const result = buildCandidatePool({
      players,
      rosteredPlayerIds: new Set(),
      eligiblePositions,
    });
    expect(result.candidates.map((p) => p.playerId)).toEqual(["active-1"]);
    expect(result.reasons.find((r) => r.code === "EXCLUDED_INACTIVE")?.value).toBe(3);
  });

  it("excludes a player whose position the league does not use", () => {
    const players = [
      player({ playerId: "fb-1", position: "FB", fantasyPositions: ["FB"] }),
      player({ playerId: "wr-1", position: "WR", fantasyPositions: ["WR"] }),
    ];
    const result = buildCandidatePool({
      players,
      rosteredPlayerIds: new Set(),
      eligiblePositions: new Set(["QB", "RB", "WR", "TE"]),
    });
    expect(result.candidates.map((p) => p.playerId)).toEqual(["wr-1"]);
    expect(result.reasons.find((r) => r.code === "EXCLUDED_POSITION")?.value).toBe(1);
  });

  it("includes a player eligible via any of multiple fantasyPositions", () => {
    const players = [player({ playerId: "flex-1", fantasyPositions: ["RB", "WR"] })];
    const result = buildCandidatePool({
      players,
      rosteredPlayerIds: new Set(),
      eligiblePositions: new Set(["WR"]),
    });
    expect(result.candidates).toHaveLength(1);
  });

  it("returns an empty pool with no crash when given no players", () => {
    const result = buildCandidatePool({
      players: [],
      rosteredPlayerIds: new Set(),
      eligiblePositions,
    });
    expect(result.candidates).toEqual([]);
    expect(result.reasons[0]?.value).toBe(0);
  });
});
