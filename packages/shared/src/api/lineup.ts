import { z } from "zod";
import { FreshnessSchema } from "./freshness.js";
import { ReasonSchema } from "../reason.js";

/** LINEUP-5: the three value modes a caller may optimize for. Mode-agnostic in the optimizer. */
export const LineupModeSchema = z.enum(["projected", "safe", "upside"]);
export type LineupMode = z.infer<typeof LineupModeSchema>;

/** AUTO-1: what a caller may request. `auto` resolves server-side to one concrete `LineupMode`. */
export const LineupModeChoiceSchema = z.enum(["projected", "safe", "upside", "auto"]);
export type LineupModeChoice = z.infer<typeof LineupModeChoiceSchema>;

/**
 * ADR-022 item 1: Auto resolves from the current-starters median win probability. Below
 * `AUTO_UPSIDE_BELOW` picks Upside, above `AUTO_SAFE_ABOVE` picks Safe, otherwise Projected.
 */
export const AUTO_UPSIDE_BELOW = 0.35;
export const AUTO_SAFE_ABOVE = 0.65;

export const LineupSlotAssignmentSchema = z.strictObject({
  slotType: z.string(),
  playerId: z.string().nullable(),
});
export type LineupSlotAssignment = z.infer<typeof LineupSlotAssignmentSchema>;

export const LineupSwapSchema = z.strictObject({
  slotIndex: z.number().int(),
  slotType: z.string(),
  playerIdIn: z.string().nullable(),
  playerIdOut: z.string().nullable(),
});
export type LineupSwap = z.infer<typeof LineupSwapSchema>;

/** `value` is the mode-adjusted, matchup-adjusted, availability-discounted value (post-optimizer). */
export const LineupPlayerSchema = z.strictObject({
  playerId: z.string(),
  name: z.string(),
  position: z.string().nullable(),
  nflTeam: z.string().nullable(),
  status: z.string().nullable(),
  injuryStatus: z.string().nullable(),
  byeWeek: z.number().int().nullable(),
  value: z.number(),
  matchupGrade: z.enum(["A", "B", "C", "D", "F"]).nullable(),
  matchupLabel: z.string().nullable(),
  locked: z.boolean(),
  kickoffApproximate: z.boolean(),
  reasons: z.array(ReasonSchema),
});
export type LineupPlayer = z.infer<typeof LineupPlayerSchema>;

export const LineupResponseSchema = z.strictObject({
  leagueId: z.string(),
  rosterId: z.number().int(),
  week: z.number().int(),
  /** The mode the caller requested (may be `auto`). */
  mode: LineupModeChoiceSchema,
  /** The concrete mode actually computed. Equals `mode` unless `mode` is `auto`. */
  resolvedMode: LineupModeSchema,
  /** Why Auto chose `resolvedMode`; null when a concrete mode was requested. */
  modeReason: ReasonSchema.nullable(),
  optimalAssignment: z.array(LineupSlotAssignmentSchema),
  currentAssignment: z.array(LineupSlotAssignmentSchema),
  swaps: z.array(LineupSwapSchema),
  pointDelta: z.number(),
  players: z.array(LineupPlayerSchema),
  issues: z.array(ReasonSchema),
  opponentRosterId: z.number().int().nullable(),
  freshness: FreshnessSchema,
});
export type LineupResponse = z.infer<typeof LineupResponseSchema>;

export const LineupRequestSchema = z.strictObject({
  week: z.coerce.number().int().min(1).max(18).optional(),
  mode: LineupModeChoiceSchema.default("auto"),
  roster: z.coerce.number().int().optional(),
});
export type LineupRequest = z.infer<typeof LineupRequestSchema>;
