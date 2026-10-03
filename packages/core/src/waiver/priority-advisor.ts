/**
 * WAIVER-6 (PLAN 5.6, ADR-003): rolling-priority waiver advisor. Steph's league (and every
 * non-FAAB league) resolves waiver claims by a strict team order ("rolling waivers"): the team
 * at the front of the order gets first pick of any contested claim, then drops to the back.
 * FAAB (WAIVER-5) is explicitly out of scope (moved to P2, ADR-003).
 *
 * This module adds no new lineup math. WAIVER-6b and WAIVER-6c both call
 * {@link computeLineupImpact} (WAIVER-2) - once per competing team for 6b, once for "my" team for
 * 6c - so every "would this help a team's lineup" judgment goes through the one assignment-based
 * Lineup Impact implementation.
 *
 * ## WAIVER-6a: waiver order
 * {@link computeWaiverOrder} sorts rosters by `waiverPosition` (1 = first). Ties (which should not
 * happen in a real Sleeper league, but are not assumed away) are broken by ascending `teamId` so
 * the order and the within-it `rank` are deterministic. If `myTeamId` is not present in `rosters`,
 * `myWaiverPosition`/`myRank` are `null` with a `MY_TEAM_NOT_FOUND` reason rather than a throw.
 *
 * ## WAIVER-6b: competing claims
 * {@link computeCompetingClaims} runs {@link computeLineupImpact} once per candidate team pair and
 * flags `likelyCompeting` when both (a) the team sits ahead of me in the order (its claim would be
 * granted before mine if we both bid) and (b) its own Lineup Impact for the candidate strictly
 * exceeds {@link DEFAULT_COMPETING_NEED_THRESHOLD} (configurable via `threshold`). "Exceeds" is
 * strict (`>`): a team whose impact exactly equals the threshold is not flagged, matching the
 * boundary convention used throughout this module (see WAIVER-6c below).
 *
 * Optional `failedClaimHistory` (ADR-002 item 7: failed claims are visible in Sleeper
 * transactions) never changes the threshold math - it only adds a `PRIOR_FAILED_CLAIM_SAME_POSITION`
 * reason when a team in the list has a past failed claim at one of the candidate's fantasy
 * positions this season, so the UI can show "also previously contested this position" as
 * corroborating evidence alongside (not folded into) the clean Lineup-Impact-based signal.
 *
 * ## WAIVER-6c: claim advice
 * {@link computeClaimAdvice} calls {@link computeLineupImpact} for "my" roster and compares the
 * resulting `impact` against a "value of priority" estimate: the opportunity cost of dropping to
 * the back of the order to win this claim. PLAN 5.6 says this estimate "depends on my position and
 * weeks remaining"; this module's formula is:
 *
 * ```
 * valueOfPriority = baseValue * positionFactor * weeksFactor
 * positionFactor  = max(minPositionFactor, 1 - positionDecayPerSlot * (myWaiverPosition - 1))
 * weeksFactor     = max(minWeeksFactor, min(1, weeksRemaining / seasonWeeks))
 * ```
 *
 * Intuition: priority is worth more to protect the closer you are to the front of the order
 * (`positionFactor` shrinks as `myWaiverPosition` grows, floored so it never hits zero) and the
 * more weeks remain to use it (`weeksFactor` shrinks as the season winds down, floored the same
 * way so a week-18 claim is still evaluated against a small but nonzero cost). All five constants
 * (`baseValue`, `positionDecayPerSlot`, `minPositionFactor`, `seasonWeeks`, `minWeeksFactor`) are
 * named, exported, and overridable per call - see the `DEFAULT_PRIORITY_*` and
 * `DEFAULT_SEASON_WEEKS` constants below. `worthIt` is `true` only when `impact` strictly exceeds
 * `valueOfPriority`; a tie recommends holding your spot (same strict-`>` boundary convention as
 * WAIVER-6b).
 *
 * ## WAIVER-6d: clear and free-agent timing
 * Two independent, separately documented calculations, per ADR-002 item 7:
 *
 * - {@link computeNextWaiverClear}: the next scheduled claim-processing run, from
 *   `waiver_day_of_week` (Sleeper convention: 0 = Monday) and an approximate processing hour
 *   (ADR-002: "about 03:00 ET"; `DEFAULT_WAIVER_CLEAR_HOUR_ET`). When the league's `dailyWaivers`
 *   flag is set (or `waiverDayOfWeek` is `null`), this module treats claims as processing every
 *   day at that hour instead of once a week.
 * - {@link computeFreeAgentTime}: per ADR-002 item 7, "`waiver_clear_days` gives the free-agent
 *   time for dropped players" - read literally as a fixed-duration, per-player timer independent
 *   of the weekly processing day: a dropped player becomes a true free agent (first come, first
 *   served) exactly `waiverClearDays` days after being dropped, whether or not that moment lines
 *   up with a scheduled weekly run. This is `packages/shared`'s own gloss on the field ("Days
 *   dropped players stay on waivers").
 * - {@link computeWaiverTiming} is a thin convenience wrapper that runs both and merges reasons,
 *   for the common case of wanting "when do waivers next clear, and (optionally) when does this
 *   specific dropped player become a free agent" in one call.
 *
 * **Timezone handling (documented simplification).** `now` and `droppedAt` are UTC instants (plain
 * `Date`, never `Date.now()` - the caller always supplies "now"). Eastern time is approximated with
 * a caller-supplied constant UTC offset (`etUtcOffsetHours`, default `-5` for EST) rather than a
 * DST-aware timezone conversion, because the NFL regular season straddles the EDT/EST changeover
 * and PLAN leaves the exact handling to the implementer. Callers who need DST correctness for a
 * specific date pass `-4` for EDT instead; this keeps the core package free of `Intl` timezone
 * dependencies while staying accurate to within the DST offset the caller chooses not to apply.
 */
import type { Reason } from "@sideline/shared";
import {
  computeLineupImpact,
  type LineupImpactCandidate,
  type LineupImpactInput,
  type LineupImpactResult,
  type LineupImpactRosterPlayer,
} from "./lineup-impact.js";

// ---------------------------------------------------------------------------
// WAIVER-6a: waiver order
// ---------------------------------------------------------------------------

export interface WaiverOrderRosterEntry {
  teamId: string;
  /** Sleeper `rosters[].settings.waiver_position`; 1 = first in line. */
  waiverPosition: number;
}

export interface WaiverOrderEntry extends WaiverOrderRosterEntry {
  /** 1-indexed position in the tie-broken sorted order (see module doc for the tie-break rule). */
  rank: number;
}

export interface WaiverOrderInput {
  rosters: readonly WaiverOrderRosterEntry[];
  myTeamId: string;
}

export interface WaiverOrderResult {
  myTeamId: string;
  /** Raw `waiverPosition` of my roster, or `null` when `myTeamId` is not in `rosters`. */
  myWaiverPosition: number | null;
  /** Tie-broken rank of my roster, or `null` when `myTeamId` is not in `rosters`. */
  myRank: number | null;
  /** Full order, sorted ascending by `waiverPosition` then `teamId`. */
  order: readonly WaiverOrderEntry[];
  reasons: Reason[];
}

/** WAIVER-6a: my current waiver position and the full league order. */
export function computeWaiverOrder(input: WaiverOrderInput): WaiverOrderResult {
  const { rosters, myTeamId } = input;

  const sorted = [...rosters].sort((a, b) => {
    if (a.waiverPosition !== b.waiverPosition) {
      return a.waiverPosition - b.waiverPosition;
    }
    return a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0;
  });
  const order: WaiverOrderEntry[] = sorted.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));

  const mine = order.find((entry) => entry.teamId === myTeamId);
  if (mine === undefined) {
    return {
      myTeamId,
      myWaiverPosition: null,
      myRank: null,
      order,
      reasons: [
        {
          code: "MY_TEAM_NOT_FOUND",
          label: "My team id was not found among the rosters supplied",
          value: myTeamId,
        },
      ],
    };
  }

  return {
    myTeamId,
    myWaiverPosition: mine.waiverPosition,
    myRank: mine.rank,
    order,
    reasons: [
      {
        code: "WAIVER_POSITION",
        label: `Waiver position ${String(mine.rank)} of ${String(order.length)}`,
        value: mine.rank,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// WAIVER-6b: competing claims
// ---------------------------------------------------------------------------

/**
 * Default Lineup Impact threshold (summed projected points over the evaluation window, same units
 * as {@link LineupImpactResult.impact}) above which a team ahead of me is flagged as likely to
 * compete for a candidate. Chosen as a conservative "clearly more than noise" bar for the default
 * 3-week window ({@link DEFAULT_LINEUP_IMPACT_WEEK_COUNT} in `lineup-impact.ts`) - about 1 point
 * per week. Configurable per call via `threshold`.
 */
export const DEFAULT_COMPETING_NEED_THRESHOLD = 3;

/** A past failed waiver claim, from this season's Sleeper transactions (ADR-002 item 7). */
export interface FailedClaimRecord {
  teamId: string;
  /** Fantasy position contested (e.g. `"RB"`), compared against the candidate's `fantasyPositions`. */
  position: string;
  week: number;
}

export interface CompetingTeamRosterInput {
  teamId: string;
  waiverPosition: number;
  rosterPositions: readonly string[];
  roster: readonly LineupImpactRosterPlayer[];
  dropPlayerId?: string;
}

export interface CompetingClaimsInput {
  candidate: LineupImpactCandidate;
  weeks: readonly number[];
  myWaiverPosition: number;
  /** Teams to evaluate - typically (but not required to be) the teams ahead of me per WAIVER-6a. */
  teams: readonly CompetingTeamRosterInput[];
  threshold?: number;
  /** This season's failed-claim history (optional; see module doc). */
  failedClaimHistory?: readonly FailedClaimRecord[];
}

export interface CompetingTeamResult {
  teamId: string;
  waiverPosition: number;
  /** True when this team's `waiverPosition` is strictly ahead of `myWaiverPosition`. */
  aheadOfMe: boolean;
  lineupImpact: LineupImpactResult;
  likelyCompeting: boolean;
  reasons: Reason[];
}

export interface CompetingClaimsResult {
  threshold: number;
  teams: readonly CompetingTeamResult[];
  reasons: Reason[];
}

/** WAIVER-6b: flags teams likely to compete for a candidate, using Lineup Impact per team. */
export function computeCompetingClaims(input: CompetingClaimsInput): CompetingClaimsResult {
  const {
    candidate,
    weeks,
    myWaiverPosition,
    teams,
    threshold = DEFAULT_COMPETING_NEED_THRESHOLD,
    failedClaimHistory = [],
  } = input;

  const candidatePositions = new Set(candidate.fantasyPositions);

  const results: CompetingTeamResult[] = teams.map((team) => {
    const lineupImpact = computeLineupImpact({
      rosterPositions: team.rosterPositions,
      roster: team.roster,
      candidate,
      weeks,
      ...(team.dropPlayerId !== undefined ? { dropPlayerId: team.dropPlayerId } : {}),
    });

    const aheadOfMe = team.waiverPosition < myWaiverPosition;
    const exceedsThreshold = lineupImpact.impact > threshold;
    const likelyCompeting = aheadOfMe && exceedsThreshold;

    const reasons: Reason[] = [];
    if (!aheadOfMe) {
      reasons.push({
        code: "NOT_AHEAD_OF_ME",
        label: "This team is not ahead of me in the waiver order, so it cannot block my claim",
        value: team.waiverPosition,
      });
    }
    reasons.push({
      code: exceedsThreshold ? "TEAM_NEED_LIKELY" : "TEAM_NEED_UNLIKELY",
      label: exceedsThreshold
        ? `This candidate would add ${lineupImpact.impact.toFixed(1)} projected points to this team's optimal lineup, above the ${threshold.toFixed(1)}-point competing-need threshold`
        : `This candidate would add only ${lineupImpact.impact.toFixed(1)} projected points to this team's optimal lineup, at or below the ${threshold.toFixed(1)}-point competing-need threshold`,
      value: lineupImpact.impact,
      impact: lineupImpact.impact,
    });

    const failedMatches = failedClaimHistory.filter(
      (record) => record.teamId === team.teamId && candidatePositions.has(record.position),
    );
    if (failedMatches.length > 0) {
      reasons.push({
        code: "PRIOR_FAILED_CLAIM_SAME_POSITION",
        label: `This team has ${String(failedMatches.length)} failed claim(s) at this candidate's position this season, corroborating but not changing the Lineup Impact estimate above`,
        value: failedMatches.length,
      });
    }

    return {
      teamId: team.teamId,
      waiverPosition: team.waiverPosition,
      aheadOfMe,
      lineupImpact,
      likelyCompeting,
      reasons,
    };
  });

  return {
    threshold,
    teams: results,
    reasons: [
      {
        code: "COMPETING_NEED_THRESHOLD",
        label: `Teams ahead of me are flagged as likely competing when their own Lineup Impact for this candidate exceeds ${threshold.toFixed(1)} points`,
        value: threshold,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// WAIVER-6c: claim advice
// ---------------------------------------------------------------------------

/** Base value (points) of holding top waiver priority for a full season. See module doc formula. */
export const DEFAULT_PRIORITY_BASE_VALUE = 6;
/** Fractional value lost per waiver-order slot further back than first. */
export const DEFAULT_PRIORITY_POSITION_DECAY_PER_SLOT = 0.05;
/** Floor so `positionFactor` never reaches 0 even very far back in the order. */
export const DEFAULT_PRIORITY_MIN_POSITION_FACTOR = 0.2;
/** Reference NFL regular-season length used to normalize `weeksRemaining` (ADR-002 item 4). */
export const DEFAULT_SEASON_WEEKS = 18;
/** Floor so `weeksFactor` never reaches 0 even in the season's final week. */
export const DEFAULT_PRIORITY_MIN_WEEKS_FACTOR = 0.15;

export interface ClaimAdviceInput {
  /** "My" roster plus the candidate; passed straight through to {@link computeLineupImpact}. */
  lineupImpactInput: LineupImpactInput;
  myWaiverPosition: number;
  /** Full weeks left in the regular season, including the current one. */
  weeksRemaining: number;
  seasonWeeks?: number;
  baseValue?: number;
  positionDecayPerSlot?: number;
  minPositionFactor?: number;
  minWeeksFactor?: number;
}

export interface ClaimAdviceResult {
  /** True when `lineupImpact.impact` strictly exceeds `valueOfPriority` (boundary: tie = false). */
  worthIt: boolean;
  lineupImpact: LineupImpactResult;
  valueOfPriority: number;
  positionFactor: number;
  weeksFactor: number;
  reasons: Reason[];
}

/** WAIVER-6c: claim-worth-it advice against a value-of-priority estimate. */
export function computeClaimAdvice(input: ClaimAdviceInput): ClaimAdviceResult {
  const {
    lineupImpactInput,
    myWaiverPosition,
    weeksRemaining,
    seasonWeeks = DEFAULT_SEASON_WEEKS,
    baseValue = DEFAULT_PRIORITY_BASE_VALUE,
    positionDecayPerSlot = DEFAULT_PRIORITY_POSITION_DECAY_PER_SLOT,
    minPositionFactor = DEFAULT_PRIORITY_MIN_POSITION_FACTOR,
    minWeeksFactor = DEFAULT_PRIORITY_MIN_WEEKS_FACTOR,
  } = input;

  const lineupImpact = computeLineupImpact(lineupImpactInput);

  const positionFactor = Math.max(
    minPositionFactor,
    1 - positionDecayPerSlot * Math.max(0, myWaiverPosition - 1),
  );
  const weeksFactor = Math.max(
    minWeeksFactor,
    seasonWeeks > 0 ? Math.min(1, weeksRemaining / seasonWeeks) : minWeeksFactor,
  );
  const valueOfPriority = baseValue * positionFactor * weeksFactor;
  const worthIt = lineupImpact.impact > valueOfPriority;

  const reasons: Reason[] = [
    {
      code: "PRIORITY_VALUE_BREAKDOWN",
      label: `Value of priority: ${baseValue.toFixed(1)} base x ${positionFactor.toFixed(2)} position factor (waiver position ${String(myWaiverPosition)}) x ${weeksFactor.toFixed(2)} weeks factor (${String(weeksRemaining)} of ${String(seasonWeeks)} weeks remaining) = ${valueOfPriority.toFixed(1)} points`,
      value: valueOfPriority,
    },
    {
      code: worthIt ? "CLAIM_WORTH_IT" : "CLAIM_NOT_WORTH_IT",
      label: worthIt
        ? `Lineup Impact (${lineupImpact.impact.toFixed(1)} pts) exceeds the value of priority (${valueOfPriority.toFixed(1)} pts): worth dropping to the back of the order`
        : `Lineup Impact (${lineupImpact.impact.toFixed(1)} pts) does not exceed the value of priority (${valueOfPriority.toFixed(1)} pts): hold your spot`,
      value: lineupImpact.impact - valueOfPriority,
      impact: lineupImpact.impact,
    },
  ];

  return { worthIt, lineupImpact, valueOfPriority, positionFactor, weeksFactor, reasons };
}

// ---------------------------------------------------------------------------
// WAIVER-6d: clear and free-agent timing
// ---------------------------------------------------------------------------

/** Approximate hour (Eastern time) waivers process, per ADR-002 item 7 ("about 03:00 ET"). */
export const DEFAULT_WAIVER_CLEAR_HOUR_ET = 3;
/** Default UTC offset used to approximate Eastern time (EST, UTC-5). See module doc. */
export const DEFAULT_ET_UTC_OFFSET_HOURS = -5;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export interface NextWaiverClearInput {
  now: Date;
  /** Sleeper `waiver_day_of_week` (0 = Monday); `null` when unset. */
  waiverDayOfWeek: number | null;
  /** When true (or `waiverDayOfWeek` is `null`), claims are treated as processing every day. */
  dailyWaivers?: boolean;
  clearHourEt?: number;
  etUtcOffsetHours?: number;
}

export interface NextWaiverClearResult {
  nextClearAt: Date;
  reasons: Reason[];
}

/** WAIVER-6d: the next scheduled waiver-claim processing run. */
export function computeNextWaiverClear(input: NextWaiverClearInput): NextWaiverClearResult {
  const {
    now,
    waiverDayOfWeek,
    dailyWaivers = false,
    clearHourEt = DEFAULT_WAIVER_CLEAR_HOUR_ET,
    etUtcOffsetHours = DEFAULT_ET_UTC_OFFSET_HOURS,
  } = input;

  const offsetMs = etUtcOffsetHours * HOUR_MS;
  // `etNow`'s UTC-labelled fields are read as the approximate ET wall clock (see module doc).
  const etNow = new Date(now.getTime() + offsetMs);

  const treatAsDaily = dailyWaivers || waiverDayOfWeek === null;
  const reasons: Reason[] = [];
  if (waiverDayOfWeek === null && !dailyWaivers) {
    reasons.push({
      code: "WAIVER_DAY_UNKNOWN_ASSUMED_DAILY",
      label: "League has no waiver_day_of_week set; treating waivers as processing daily",
    });
  }

  const targetEtDay = treatAsDaily ? etNow.getUTCDay() : (waiverDayOfWeek + 1) % 7;
  const stepMs = (treatAsDaily ? 1 : 7) * DAY_MS;

  const daysUntil = (targetEtDay - etNow.getUTCDay() + 7) % 7;
  let candidateEt = new Date(
    Date.UTC(
      etNow.getUTCFullYear(),
      etNow.getUTCMonth(),
      etNow.getUTCDate() + daysUntil,
      clearHourEt,
      0,
      0,
      0,
    ),
  );
  if (candidateEt.getTime() <= etNow.getTime()) {
    candidateEt = new Date(candidateEt.getTime() + stepMs);
  }

  const nextClearAt = new Date(candidateEt.getTime() - offsetMs);

  reasons.push({
    code: "WAIVER_CLEAR_SCHEDULE",
    label: treatAsDaily
      ? `Waivers process daily at about ${String(clearHourEt)}:00 ET`
      : `Waivers process weekly at about ${String(clearHourEt)}:00 ET`,
    value: nextClearAt.toISOString(),
  });

  return { nextClearAt, reasons };
}

export interface FreeAgentTimeInput {
  /** When the player was dropped (or otherwise entered the waiver wire). */
  droppedAt: Date;
  /** Sleeper `waiver_clear_days`; `null` when unset. */
  waiverClearDays: number | null;
}

export interface FreeAgentTimeResult {
  freeAgentAt: Date;
  reasons: Reason[];
}

/**
 * WAIVER-6d: a dropped player's free-agent time, per ADR-002 item 7's gloss on
 * `waiver_clear_days` ("days dropped players stay on waivers") - `droppedAt` plus
 * `waiverClearDays` days, independent of the weekly processing schedule (see module doc).
 */
export function computeFreeAgentTime(input: FreeAgentTimeInput): FreeAgentTimeResult {
  const { droppedAt, waiverClearDays } = input;
  const reasons: Reason[] = [];
  if (waiverClearDays === null) {
    reasons.push({
      code: "WAIVER_CLEAR_DAYS_UNKNOWN_ASSUMED_IMMEDIATE",
      label:
        "League has no waiver_clear_days set; treating dropped players as immediately available",
    });
  }
  const days = waiverClearDays ?? 0;
  const freeAgentAt = new Date(droppedAt.getTime() + days * DAY_MS);
  reasons.push({
    code: "FREE_AGENT_TIME",
    label: `Becomes a free agent, first come first served, ${String(days)} day(s) after being dropped`,
    value: freeAgentAt.toISOString(),
  });
  return { freeAgentAt, reasons };
}

export interface WaiverTimingInput {
  now: Date;
  waiverDayOfWeek: number | null;
  dailyWaivers?: boolean;
  waiverClearDays: number | null;
  clearHourEt?: number;
  etUtcOffsetHours?: number;
  /** When provided, also computes this specific player's free-agent time. */
  droppedAt?: Date;
}

export interface WaiverTimingResult {
  nextClearAt: Date;
  /** `null` unless `droppedAt` was supplied. */
  freeAgentAt: Date | null;
  reasons: Reason[];
}

/** WAIVER-6d convenience wrapper: next clear time, and (optionally) one player's free-agent time. */
export function computeWaiverTiming(input: WaiverTimingInput): WaiverTimingResult {
  const {
    now,
    waiverDayOfWeek,
    dailyWaivers,
    waiverClearDays,
    clearHourEt,
    etUtcOffsetHours,
    droppedAt,
  } = input;

  const clear = computeNextWaiverClear({
    now,
    waiverDayOfWeek,
    ...(dailyWaivers !== undefined ? { dailyWaivers } : {}),
    ...(clearHourEt !== undefined ? { clearHourEt } : {}),
    ...(etUtcOffsetHours !== undefined ? { etUtcOffsetHours } : {}),
  });
  const reasons = [...clear.reasons];

  let freeAgentAt: Date | null = null;
  if (droppedAt !== undefined) {
    const freeAgent = computeFreeAgentTime({ droppedAt, waiverClearDays });
    freeAgentAt = freeAgent.freeAgentAt;
    reasons.push(...freeAgent.reasons);
  }

  return { nextClearAt: clear.nextClearAt, freeAgentAt, reasons };
}
