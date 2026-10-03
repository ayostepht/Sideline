import { z } from "zod";
import { ReasonSchema } from "../reason.js";
import { WaiverModeSchema } from "../domain/league.js";
import { FreshnessSchema } from "./freshness.js";

/**
 * WAIVER-1..WAIVER-6d (PLAN 5.6, T4.5b): request/response contracts for `GET /api/l/{leagueId}/
 * waivers`. `positions` is a comma-separated list of fantasy positions (e.g. `"RB,WR"`) applied as
 * an identical filter to both the "for my team" and "best available" views (WAIVER-4); omitted or
 * empty means no filter. `week` defaults to the current NFL week; `roster` overrides "my" roster
 * (defaults to the stored Sleeper user's team), matching `LineupRequestSchema`'s conventions.
 */
export const WaiverRequestSchema = z.strictObject({
  week: z.coerce.number().int().min(1).max(18).optional(),
  roster: z.coerce.number().int().optional(),
  positions: z
    .string()
    .trim()
    .min(1)
    .transform((raw) =>
      raw
        .split(",")
        .map((p) => p.trim().toUpperCase())
        .filter((p) => p.length > 0),
    )
    .optional(),
});
export type WaiverRequest = z.infer<typeof WaiverRequestSchema>;

/** TREND-4's Rising/Steady/Falling signal, duplicated here (not re-exported from `@sideline/core`
 * by convention: `packages/shared` contracts never import `@sideline/core` types directly). */
export const WaiverTrendSignalSchema = z.enum(["Rising", "Steady", "Falling"]);
export type WaiverTrendSignal = z.infer<typeof WaiverTrendSignalSchema>;

/** TREND-5's momentum label. */
export const WaiverMomentumLabelSchema = z.enum(["Hot", "Warm", "Neutral", "Cold"]);
export type WaiverMomentumLabel = z.infer<typeof WaiverMomentumLabelSchema>;

/**
 * One waiver candidate, shown in both the "for my team" and "best available" views (WAIVER-4).
 * `lineupImpact` and `rosValue` are the raw (non-percentile) values the two views sort by;
 * `waiverScore` is the 0-100 composite (WAIVER-3). `reasons` carries the Waiver Score's weighted
 * component breakdown chips plus the suggested-drop explanation.
 */
export const WaiverCandidateSchema = z.strictObject({
  playerId: z.string(),
  name: z.string(),
  position: z.string().nullable(),
  fantasyPositions: z.array(z.string()),
  nflTeam: z.string().nullable(),
  status: z.string().nullable(),
  injuryStatus: z.string().nullable(),
  /** Lineup Impact (WAIVER-2): projected starting points gained over the evaluation window. */
  lineupImpact: z.number(),
  /** Rest-of-season projected value (PROJ-4). */
  rosValue: z.number(),
  /** Composite 0-100 Waiver Score (WAIVER-3). */
  waiverScore: z.number(),
  trendSignal: WaiverTrendSignalSchema,
  momentumLabel: WaiverMomentumLabelSchema,
  /** The roster player this candidate would replace, or null (straight add / no legal drop). */
  suggestedDropPlayerId: z.string().nullable(),
  reasons: z.array(ReasonSchema),
});
export type WaiverCandidate = z.infer<typeof WaiverCandidateSchema>;

/** WAIVER-6a: one team's position in the waiver order. */
export const WaiverOrderEntrySchema = z.strictObject({
  rosterId: z.number().int(),
  teamName: z.string(),
  waiverPosition: z.number().int().nullable(),
  rank: z.number().int(),
  isMine: z.boolean(),
});
export type WaiverOrderEntry = z.infer<typeof WaiverOrderEntrySchema>;

/** WAIVER-6b: one team's likely-competing-claim flag for a single candidate. */
export const CompetingTeamSchema = z.strictObject({
  rosterId: z.number().int(),
  teamName: z.string(),
  waiverPosition: z.number().int().nullable(),
  aheadOfMe: z.boolean(),
  lineupImpact: z.number(),
  likelyCompeting: z.boolean(),
  reasons: z.array(ReasonSchema),
});
export type CompetingTeam = z.infer<typeof CompetingTeamSchema>;

/** WAIVER-6c: whether a claim is worth dropping to the back of the waiver order for. */
export const ClaimAdviceSchema = z.strictObject({
  worthIt: z.boolean(),
  lineupImpact: z.number(),
  valueOfPriority: z.number(),
  positionFactor: z.number(),
  weeksFactor: z.number(),
  reasons: z.array(ReasonSchema),
});
export type ClaimAdvice = z.infer<typeof ClaimAdviceSchema>;

/** Priority-advisor detail for one candidate (capped to the top-scoring candidates; see
 * `WaiverPriorityAdvisor.reasons` for the exact cap and why). */
export const WaiverPriorityCandidateSchema = z.strictObject({
  playerId: z.string(),
  competingTeams: z.array(CompetingTeamSchema),
  claimAdvice: ClaimAdviceSchema,
});
export type WaiverPriorityCandidate = z.infer<typeof WaiverPriorityCandidateSchema>;

/**
 * WAIVER-6: rolling-priority waiver advisor. `applicable` is false for FAAB leagues (WAIVER-5,
 * moved to P2, ADR-003): the rest of the object is still well-formed but empty in that case, with
 * a `FAAB_NOT_SUPPORTED` reason explaining why. `nextClearAt` is ISO 8601, computed unconditionally
 * regardless of `applicable` (`computeNextWaiverClear` in `@sideline/core` always returns a best
 * estimate, falling back to "assume daily processing" with a `WAIVER_DAY_UNKNOWN_ASSUMED_DAILY`
 * reason when the league hasn't configured a waiver day) - nullable here only for schema
 * forward-compatibility with a future producer that might not be able to compute it, not because
 * today's data function ever emits null.
 */
export const WaiverPriorityAdvisorSchema = z.strictObject({
  applicable: z.boolean(),
  waiverMode: WaiverModeSchema,
  myWaiverPosition: z.number().int().nullable(),
  myRank: z.number().int().nullable(),
  order: z.array(WaiverOrderEntrySchema),
  nextClearAt: z.string().nullable(),
  waiverClearDays: z.number().int().nullable(),
  competingNeedThreshold: z.number(),
  candidates: z.array(WaiverPriorityCandidateSchema),
  reasons: z.array(ReasonSchema),
});
export type WaiverPriorityAdvisor = z.infer<typeof WaiverPriorityAdvisorSchema>;

export const WaiverResponseSchema = z.strictObject({
  leagueId: z.string(),
  rosterId: z.number().int(),
  week: z.number().int(),
  /** Size of the post-prefilter candidate set these views and the advisor are drawn from. */
  candidatePoolSize: z.number().int(),
  poolReasons: z.array(ReasonSchema),
  /** WAIVER-4 "for my team": sorted by Lineup Impact descending. */
  forMyTeam: z.array(WaiverCandidateSchema),
  /** WAIVER-4 "best available": sorted by rest-of-season value descending. */
  bestAvailable: z.array(WaiverCandidateSchema),
  priorityAdvisor: WaiverPriorityAdvisorSchema,
  freshness: FreshnessSchema,
});
export type WaiverResponse = z.infer<typeof WaiverResponseSchema>;
