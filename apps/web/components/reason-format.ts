export interface ImpactText {
  sign: "up" | "down" | "none";
  /** Text such as "+1.2 pts" or "-0.8 pts". */
  text: string;
  /** Spoken form: "adds 1.2 points". */
  spoken: string;
}

export function formatImpact(impact: number | undefined): ImpactText {
  if (impact === undefined || !Number.isFinite(impact) || Math.abs(impact) < 0.05) {
    return { sign: "none", text: "", spoken: "" };
  }
  const abs = Math.abs(impact).toFixed(1);
  return impact > 0
    ? { sign: "up", text: `+${abs} pts`, spoken: `adds ${abs} points` }
    : { sign: "down", text: `-${abs} pts`, spoken: `costs ${abs} points` };
}

/**
 * Short plain-language text for a `Reason.projectedPoints` value, e.g. "18.4 proj pts". Returns
 * `undefined` when there is nothing to show (missing or non-finite), mirroring `formatImpact`'s
 * one-decimal rounding convention so the two numbers read consistently next to each other.
 */
export function formatProjectedPoints(points: number | undefined): string | undefined {
  if (points === undefined || !Number.isFinite(points)) return undefined;
  return `${points.toFixed(1)} proj pts`;
}

/**
 * Formats a `Reason.value` for display. Numbers round to one decimal place (same convention as
 * `formatImpact`/`formatProjectedPoints`) so raw floats like `94.5945945945946` read as `94.6`.
 * Strings (e.g. a position code or a player id, as on `SUGGESTED_DROP`) pass through unchanged.
 * `undefined` stays `undefined`.
 */
export function formatReasonValue(value: number | string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === "number" ? value.toFixed(1) : value;
}
