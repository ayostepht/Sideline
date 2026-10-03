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
