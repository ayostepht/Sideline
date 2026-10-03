import { describe, expect, it } from "vitest";
import { isPlayerEligibleForSlot, resolveSlots, SLOT_ELIGIBILITY } from "./eligibility.js";

/** SLOT_ELIGIBILITY is keyed by arbitrary string, so lookups are `readonly string[] | undefined`
 * under noUncheckedIndexedAccess; every slot type used in these tests is a key asserted to exist
 * by the "implements the exact 14-entry eligibility map" test below. */
function eligibleFor(slotType: keyof typeof SLOT_ELIGIBILITY): readonly string[] {
  const positions = SLOT_ELIGIBILITY[slotType];
  if (positions === undefined) {
    throw new Error(`missing SLOT_ELIGIBILITY entry for ${slotType}`);
  }
  return positions;
}

describe("resolveSlots (LINEUP-1)", () => {
  it("resolves a typical roster_positions array: preserves order, duplicates, drops BN/IR/TAXI", () => {
    const rosterPositions = [
      "QB",
      "RB",
      "RB",
      "WR",
      "WR",
      "WR",
      "TE",
      "FLEX",
      "K",
      "DEF",
      "BN",
      "BN",
      "BN",
      "BN",
      "BN",
      "BN",
      "IR",
    ];
    const { slots, warnings } = resolveSlots(rosterPositions);
    expect(warnings).toEqual([]);
    expect(slots.map((s) => s.slotType)).toEqual([
      "QB",
      "RB",
      "RB",
      "WR",
      "WR",
      "WR",
      "TE",
      "FLEX",
      "K",
      "DEF",
    ]);
    // Two RB entries produce two independent RB slot instances.
    expect(slots.filter((s) => s.slotType === "RB")).toHaveLength(2);
    expect(slots.find((s) => s.slotType === "FLEX")?.eligiblePositions).toEqual(["RB", "WR", "TE"]);
  });

  it("drops a TAXI-only/BN/IR roster and produces no slots and no warnings", () => {
    const { slots, warnings } = resolveSlots(["BN", "IR", "TAXI", "BN"]);
    expect(slots).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("produces no slots and no warnings for an empty array", () => {
    const { slots, warnings } = resolveSlots([]);
    expect(slots).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("excludes an unknown slot type from slots and reports a warning", () => {
    const { slots, warnings } = resolveSlots(["QB", "OP_WEIRD", "WR"]);
    expect(slots.map((s) => s.slotType)).toEqual(["QB", "WR"]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ code: "UNKNOWN_SLOT_TYPE", value: "OP_WEIRD" });
  });

  it("implements the exact 14-entry eligibility map from the spec", () => {
    expect(SLOT_ELIGIBILITY).toEqual({
      QB: ["QB"],
      RB: ["RB"],
      WR: ["WR"],
      TE: ["TE"],
      K: ["K"],
      DEF: ["DEF"],
      FLEX: ["RB", "WR", "TE"],
      WRRB_FLEX: ["RB", "WR"],
      REC_FLEX: ["WR", "TE"],
      SUPER_FLEX: ["QB", "RB", "WR", "TE"],
      DL: ["DL"],
      LB: ["LB"],
      DB: ["DB"],
      IDP_FLEX: ["DL", "LB", "DB"],
    });
  });
});

describe("isPlayerEligibleForSlot (LINEUP-1)", () => {
  it("matches a direct position slot", () => {
    expect(isPlayerEligibleForSlot(["RB"], eligibleFor("RB"))).toBe(true);
  });

  it("matches FLEX for RB, WR, or TE", () => {
    expect(isPlayerEligibleForSlot(["RB"], eligibleFor("FLEX"))).toBe(true);
    expect(isPlayerEligibleForSlot(["WR"], eligibleFor("FLEX"))).toBe(true);
    expect(isPlayerEligibleForSlot(["TE"], eligibleFor("FLEX"))).toBe(true);
  });

  it("matches WRRB_FLEX for RB or WR but not TE", () => {
    expect(isPlayerEligibleForSlot(["RB"], eligibleFor("WRRB_FLEX"))).toBe(true);
    expect(isPlayerEligibleForSlot(["WR"], eligibleFor("WRRB_FLEX"))).toBe(true);
    expect(isPlayerEligibleForSlot(["TE"], eligibleFor("WRRB_FLEX"))).toBe(false);
  });

  it("matches REC_FLEX for WR or TE but not RB", () => {
    expect(isPlayerEligibleForSlot(["WR"], eligibleFor("REC_FLEX"))).toBe(true);
    expect(isPlayerEligibleForSlot(["TE"], eligibleFor("REC_FLEX"))).toBe(true);
    expect(isPlayerEligibleForSlot(["RB"], eligibleFor("REC_FLEX"))).toBe(false);
  });

  it("matches SUPER_FLEX for QB, RB, WR, or TE", () => {
    for (const pos of ["QB", "RB", "WR", "TE"]) {
      expect(isPlayerEligibleForSlot([pos], eligibleFor("SUPER_FLEX"))).toBe(true);
    }
    expect(isPlayerEligibleForSlot(["K"], eligibleFor("SUPER_FLEX"))).toBe(false);
  });

  it("matches IDP_FLEX for DL, LB, or DB", () => {
    for (const pos of ["DL", "LB", "DB"]) {
      expect(isPlayerEligibleForSlot([pos], eligibleFor("IDP_FLEX"))).toBe(true);
    }
    expect(isPlayerEligibleForSlot(["WR"], eligibleFor("IDP_FLEX"))).toBe(false);
  });

  it("matches when any of the player's multiple fantasyPositions fits", () => {
    expect(isPlayerEligibleForSlot(["RB", "WR"], eligibleFor("WR"))).toBe(true);
  });

  it("returns false for a clean non-match", () => {
    expect(isPlayerEligibleForSlot(["QB"], eligibleFor("DEF"))).toBe(false);
  });
});
