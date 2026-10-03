/**
 * Shared builders for the T3.6 golden optimizer scenarios (tests/golden/optimizer.golden.test.ts).
 * Kept separate from the test file so each golden scenario's hand-computed comments stay close to
 * the assertions without the builder boilerplate in between.
 */
import type { RecommendLineupPlayer, SlotSpec } from "../../packages/core/src/index.js";

export const slot = (slotType: string, eligiblePositions: readonly string[]): SlotSpec => ({
  slotType,
  eligiblePositions,
});

export const player = (
  overrides: Partial<RecommendLineupPlayer> & { playerId: string },
): RecommendLineupPlayer => ({
  fantasyPositions: ["RB"],
  rawValue: 0,
  status: null,
  isBye: false,
  kickoffUtc: null,
  kickoffApproximate: false,
  ...overrides,
});

/** Fixed "now" for every golden scenario that cares about locks. */
export const NOW = new Date("2026-09-14T18:00:00.000Z");
/** After NOW: a game that has not kicked off yet, so the player is not locked. */
export const NOT_LOCKED_KICKOFF = "2026-09-14T20:00:00.000Z";
/** Before NOW: a game already underway, so the player is locked. */
export const LOCKED_KICKOFF = "2026-09-14T17:00:00.000Z";
