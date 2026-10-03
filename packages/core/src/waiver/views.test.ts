import { describe, expect, it } from "vitest";
import { sortBestAvailable, sortForMyTeam, type WaiverViewCandidate } from "./views.js";

// A: low ROS, high Lineup Impact (a player who'd help my roster right now).
// B: high ROS, low Lineup Impact (a player who wouldn't start on my roster today but is the
// stronger season-long asset).
const candidateA: WaiverViewCandidate = {
  playerId: "A",
  fantasyPositions: ["RB"],
  lineupImpact: 10,
  rosValue: 5,
};
const candidateB: WaiverViewCandidate = {
  playerId: "B",
  fantasyPositions: ["WR"],
  lineupImpact: 2,
  rosValue: 20,
};

describe("sortForMyTeam", () => {
  it("ranks higher-Lineup-Impact candidate A above higher-ROS candidate B", () => {
    const result = sortForMyTeam([candidateB, candidateA]);
    expect(result.map((c) => c.playerId)).toEqual(["A", "B"]);
  });

  it("returns an empty array for an empty candidate list", () => {
    expect(sortForMyTeam([])).toEqual([]);
  });

  it("filters by position, keeping only candidates matching one of the given positions", () => {
    const result = sortForMyTeam([candidateA, candidateB], ["WR"]);
    expect(result.map((c) => c.playerId)).toEqual(["B"]);
  });

  it("treats an empty position filter as no filter", () => {
    const result = sortForMyTeam([candidateA, candidateB], []);
    expect(result.map((c) => c.playerId)).toEqual(["A", "B"]);
  });

  it("breaks ties by ascending playerId", () => {
    const tiedA: WaiverViewCandidate = { ...candidateA, playerId: "Z", lineupImpact: 5 };
    const tiedB: WaiverViewCandidate = { ...candidateB, playerId: "Y", lineupImpact: 5 };
    const result = sortForMyTeam([tiedA, tiedB]);
    expect(result.map((c) => c.playerId)).toEqual(["Y", "Z"]);
  });
});

describe("sortBestAvailable", () => {
  it("ranks higher-ROS candidate B above higher-Lineup-Impact candidate A, the reverse of sortForMyTeam", () => {
    const result = sortBestAvailable([candidateA, candidateB]);
    expect(result.map((c) => c.playerId)).toEqual(["B", "A"]);
  });

  it("returns an empty array for an empty candidate list", () => {
    expect(sortBestAvailable([])).toEqual([]);
  });

  it("filters by position, keeping only candidates matching one of the given positions", () => {
    const result = sortBestAvailable([candidateA, candidateB], ["RB"]);
    expect(result.map((c) => c.playerId)).toEqual(["A"]);
  });

  it("supports multiple positions in the filter", () => {
    const result = sortBestAvailable([candidateA, candidateB], ["RB", "WR"]);
    expect(result.map((c) => c.playerId)).toEqual(["B", "A"]);
  });

  it("breaks ties by ascending playerId", () => {
    const tiedA: WaiverViewCandidate = { ...candidateA, playerId: "Z", rosValue: 5 };
    const tiedB: WaiverViewCandidate = { ...candidateB, playerId: "Y", rosValue: 5 };
    const result = sortBestAvailable([tiedA, tiedB]);
    expect(result.map((c) => c.playerId)).toEqual(["Y", "Z"]);
  });
});
