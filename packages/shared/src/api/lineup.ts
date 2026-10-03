import { z } from "zod";
import { FreshnessSchema } from "./freshness.js";
import { ReasonSchema } from "../reason.js";

/** LINEUP-5: the three value modes a caller may optimize for. Mode-agnostic in the optimizer. */
export const LineupModeSchema = z.enum(["projected", "safe", "upside"]);
export type LineupMode = z.infer<typeof LineupModeSchema>;

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
  mode: LineupModeSchema,
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
  mode: LineupModeSchema.default("projected"),
  roster: z.coerce.number().int().optional(),
});
export type LineupRequest = z.infer<typeof LineupRequestSchema>;
