/**
 * TREND-2 (PLAN 5.5): usage trend from nflverse weekly usage rows. Only meaningful when nflverse
 * is enabled; whether to call this at all for a given league/player is the caller's job (a
 * feature flag), not this module's.
 *
 * Returns the position-relevant subset of usage fields (see {@link POSITION_USAGE_FIELDS}), each
 * with an L3-window value, a "prior weeks" value, and the delta between them.
 *
 * Window definition: weeks are sorted ascending by week. The L3 window is the last
 * `min(3, n)` weeks; the prior window is every week before that (so it can be 0, 1, or many
 * weeks, not a fixed-size window). Values are averaged ignoring nulls (nflverse rows can have
 * nulls for stats that don't apply that week, e.g. a backup who didn't play); if a window has no
 * non-null values for a field, that side of the delta is null.
 */
import type { Reason, UsageWeek } from "@sideline/shared";

/** Window size mirroring {@link TREND_L3_WINDOW} in scoring-trend.ts (kept local and duplicated
 * on purpose: this module must not import the scoring-trend module, per ADR-015 item 2's
 * decoupling pattern for TREND modules that could otherwise be imported by the same consumer). */
const L3_WINDOW = 3;

/** The nflverse-derived usage fields TREND-2 can report on. `rzTouches` is a raw count, the rest
 * are fractions 0 to 1 (see {@link UsageWeek}). */
export type UsageFieldKey =
  "snapPct" | "targetShare" | "airYardsShare" | "carryShare" | "rzTouches";

/**
 * Position to relevant-usage-field mapping (TREND-2 "position-relevant subset"). Positions not
 * listed (K, DEF, and anything unrecognized) have no nflverse usage stats worth tracking and
 * resolve to an empty field list.
 *
 * - QB: snap share (health/mobility signal) and red zone touches (goal-line rushing work).
 * - RB: snap share, carry share, target share (receiving work), red zone touches.
 * - WR / TE: snap share, target share, air yards share (role in the passing game), red zone
 *   touches. Carry share is omitted for both: wildcat/jet-sweep carries are rare enough not to be
 *   a meaningful trend signal for these positions.
 */
export const POSITION_USAGE_FIELDS: Readonly<Record<string, readonly UsageFieldKey[]>> = {
  QB: ["snapPct", "rzTouches"],
  RB: ["snapPct", "carryShare", "targetShare", "rzTouches"],
  WR: ["snapPct", "targetShare", "airYardsShare", "rzTouches"],
  TE: ["snapPct", "targetShare", "airYardsShare", "rzTouches"],
};

export interface UsageTrendInput {
  /** The player's fantasy position (e.g. "QB", "RB", "WR", "TE", "K", "DEF"). */
  position: string;
  /** Weeks the player actually played, any order. */
  weeks: readonly UsageWeek[];
}

export interface UsageFieldTrend {
  field: UsageFieldKey;
  /** Average of this field over the L3 window, ignoring nulls; null if no non-null values. */
  l3Value: number | null;
  /** Average of this field over the prior weeks, ignoring nulls; null if no non-null values. */
  priorValue: number | null;
  /** `l3Value - priorValue`, or null when either side is null. */
  delta: number | null;
}

export interface UsageTrendResult {
  /** Empty when the position has no tracked usage fields (see {@link POSITION_USAGE_FIELDS}). */
  fields: UsageFieldTrend[];
  reasons: Reason[];
}

function average(weeks: readonly UsageWeek[], field: UsageFieldKey): number | null {
  const values = weeks.map((w) => w[field]).filter((v): v is number => v !== null);
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function computeUsageTrend(input: UsageTrendInput): UsageTrendResult {
  const { position, weeks } = input;
  const fieldKeys = POSITION_USAGE_FIELDS[position];

  if (fieldKeys === undefined || fieldKeys.length === 0) {
    return {
      fields: [],
      reasons: [
        {
          code: "TREND_USAGE_NOT_POSITION_RELEVANT",
          label: `We don't track usage stats for ${position}`,
          value: position,
        },
      ],
    };
  }

  const sorted = [...weeks].sort((a, b) => a.week - b.week);
  const n = sorted.length;
  const l3Weeks = sorted.slice(-Math.min(L3_WINDOW, n));
  const priorWeeks = sorted.slice(0, n - l3Weeks.length);

  const reasons: Reason[] = [];
  if (n < L3_WINDOW) {
    reasons.push({
      code: "TREND_USAGE_SMALL_SAMPLE",
      label: `Fewer than ${L3_WINDOW} weeks of usage data`,
      value: n,
    });
  }
  if (priorWeeks.length === 0) {
    reasons.push({
      code: "TREND_USAGE_NO_PRIOR_WEEKS",
      label: "No prior weeks available to compare usage against",
      value: 0,
    });
  }

  const fields: UsageFieldTrend[] = fieldKeys.map((field) => {
    const l3Value = average(l3Weeks, field);
    const priorValue = average(priorWeeks, field);
    const delta = l3Value !== null && priorValue !== null ? l3Value - priorValue : null;
    return { field, l3Value, priorValue, delta };
  });

  return { fields, reasons };
}
