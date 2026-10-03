/**
 * LINEUP-1 (PLAN 5.4): roster slot resolution and player/slot eligibility.
 *
 * `League.rosterPositions` is Sleeper's raw array, one entry per slot instance (duplicates mean
 * multiple slots of that type). `BN`, `IR`, and `TAXI` entries are reserve/bench capacity, not
 * fillable starting slots, and are dropped. Every other entry is looked up in
 * {@link SLOT_ELIGIBILITY}; an entry that is not a known slot type is unknown, excluded from the
 * fillable slot list (so it can never be assigned a player), and surfaced as a warning
 * (`UNKNOWN_SLOT_TYPE`) so the caller can tell the user their league has a slot type Sideline does
 * not understand.
 */
import type { Reason } from "@sideline/shared";

/**
 * Fixed map from roster slot type to the fantasy positions eligible to fill it (LINEUP-1).
 * Direct slots (QB, RB, WR, TE, K, DEF, DL, LB, DB) accept only their own position. Flex slots
 * accept the union named in PLAN.md: FLEX = RB/WR/TE, WRRB_FLEX = RB/WR, REC_FLEX = WR/TE,
 * SUPER_FLEX = QB/RB/WR/TE, IDP_FLEX = DL/LB/DB.
 */
export const SLOT_ELIGIBILITY: Readonly<Record<string, readonly string[]>> = {
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
};

/** `roster_positions` entries that are reserve/bench capacity, not fillable starting slots. */
const RESERVE_SLOT_TYPES: ReadonlySet<string> = new Set(["BN", "IR", "TAXI"]);

export interface SlotSpec {
  slotType: string;
  eligiblePositions: readonly string[];
}

export interface ResolveSlotsResult {
  slots: SlotSpec[];
  warnings: Reason[];
}

/**
 * Turns a league's raw `roster_positions` array into the list of fillable starting slots
 * (LINEUP-1). Preserves input order and duplicate count: two `"RB"` entries produce two
 * independent `RB` slot instances. `BN`/`IR`/`TAXI` entries are dropped silently. Any other entry
 * not found in {@link SLOT_ELIGIBILITY} is excluded from `slots` and reported in `warnings`.
 */
export function resolveSlots(rosterPositions: readonly string[]): ResolveSlotsResult {
  const slots: SlotSpec[] = [];
  const warnings: Reason[] = [];

  for (const slotType of rosterPositions) {
    if (RESERVE_SLOT_TYPES.has(slotType)) {
      continue;
    }
    const eligiblePositions = SLOT_ELIGIBILITY[slotType];
    if (eligiblePositions === undefined) {
      warnings.push({
        code: "UNKNOWN_SLOT_TYPE",
        label: `Unknown roster slot type "${slotType}" cannot be filled`,
        value: slotType,
      });
      continue;
    }
    slots.push({ slotType, eligiblePositions });
  }

  return { slots, warnings };
}

/**
 * True iff any of the player's `fantasyPositions` is in the slot's eligible position list
 * (LINEUP-1).
 */
export function isPlayerEligibleForSlot(
  fantasyPositions: readonly string[],
  eligiblePositions: readonly string[],
): boolean {
  return fantasyPositions.some((position) => eligiblePositions.includes(position));
}
