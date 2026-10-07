import { z } from "zod";
import { FreshnessSchema } from "./freshness.js";
import { ReasonSchema } from "../reason.js";

/** TRADE-1: max players one side of a proposal may include. */
export const TRADE_MAX_PLAYERS_PER_SIDE = 3;
/** ADR-022 item 7: the finder computes playoff odds only for this many top suggestions. */
export const TRADE_FINDER_PLAYOFF_TOP_N = 10;

/**
 * TRADE-4 fairness cutoffs (ADR-022 item 6). Let `a` and `b` be the two teams' ROS lineup gains.
 * - Either gain <= 0: `lopsided`.
 * - ratio = min(a, b) / max(a, b).
 * - ratio >= `TRADE_FAIR_RATIO_MIN` (0.75): `fair`.
 * - `TRADE_LEANS_RATIO_MIN` (0.4) <= ratio < 0.75: `leans_you` if my gain is larger, else
 *   `leans_them` (it leans toward the bigger gainer).
 * - ratio < 0.4: `lopsided`.
 * The logic lives in packages/core (P7b.3). A fairness signal, not an acceptance prediction.
 */
export const TRADE_FAIR_RATIO_MIN = 0.75;
export const TRADE_LEANS_RATIO_MIN = 0.4;

/** Minimal player reference shared by trade DTOs. */
export const TradePlayerRefSchema = z.strictObject({
  playerId: z.string(),
  name: z.string(),
  position: z.string().nullable(),
  nflTeam: z.string().nullable(),
});
export type TradePlayerRef = z.infer<typeof TradePlayerRefSchema>;

export const TradeFairnessSchema = z.enum(["fair", "leans_you", "leans_them", "lopsided"]);
export type TradeFairness = z.infer<typeof TradeFairnessSchema>;

const uniqueIds = z
  .array(z.string().min(1))
  .min(1)
  .max(TRADE_MAX_PLAYERS_PER_SIDE)
  .refine((a) => new Set(a).size === a.length, { message: "player ids must be unique" });

export const TradeEvaluateRequestSchema = z.strictObject({
  otherRosterId: z.number().int().positive(),
  give: uniqueIds,
  get: uniqueIds,
});
export type TradeEvaluateRequest = z.infer<typeof TradeEvaluateRequestSchema>;

/** Playoff fields are null when not computed (for example finder rows beyond the top N). */
export const TradeTeamImpactSchema = z.strictObject({
  rosterId: z.number().int(),
  rosLineupBefore: z.number(),
  rosLineupAfter: z.number(),
  rosLineupDelta: z.number(),
  playoffPctBefore: z.number().nullable(),
  playoffPctAfter: z.number().nullable(),
  playoffPctDelta: z.number().nullable(),
  /** Players auto-dropped by the uneven-trade rule (TRADE-3). */
  dropped: z.array(TradePlayerRefSchema),
  reasons: z.array(ReasonSchema),
});
export type TradeTeamImpact = z.infer<typeof TradeTeamImpactSchema>;

export const TradeEvaluateResponseSchema = z.strictObject({
  give: z.array(TradePlayerRefSchema),
  get: z.array(TradePlayerRefSchema),
  mine: TradeTeamImpactSchema,
  theirs: TradeTeamImpactSchema,
  fairness: TradeFairnessSchema,
  reasons: z.array(ReasonSchema),
  freshness: FreshnessSchema,
});
export type TradeEvaluateResponse = z.infer<typeof TradeEvaluateResponseSchema>;

export const TradeSuggestionSchema = z.strictObject({
  otherRosterId: z.number().int(),
  give: z.array(TradePlayerRefSchema),
  get: z.array(TradePlayerRefSchema),
  mine: TradeTeamImpactSchema,
  theirs: TradeTeamImpactSchema,
  fairness: TradeFairnessSchema,
  reasons: z.array(ReasonSchema),
});
export type TradeSuggestion = z.infer<typeof TradeSuggestionSchema>;

export const TradeFinderResponseSchema = z.strictObject({
  suggestions: z.array(TradeSuggestionSchema),
  evaluatedCount: z.number().int().min(0),
  freshness: FreshnessSchema,
});
export type TradeFinderResponse = z.infer<typeof TradeFinderResponseSchema>;
