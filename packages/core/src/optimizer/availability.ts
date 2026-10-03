/**
 * LINEUP-4 (PLAN 5.4): availability discounting. Out, IR, Suspended, or bye means the player's
 * value is zeroed and they are never recommended. Doubtful multiplies value by
 * {@link AVAILABILITY_MULTIPLIERS.doubtful}; Questionable by {@link AVAILABILITY_MULTIPLIERS.questionable}.
 * Constants are exported so they are configurable, and the discount applied is always surfaced in
 * the returned reasons.
 */
import type { Reason } from "@sideline/shared";

/** Multipliers applied to a player's raw projected value based on injury status (LINEUP-4). */
export const AVAILABILITY_MULTIPLIERS = {
  doubtful: 0.25,
  questionable: 0.9,
} as const;

/** Statuses that zero out a player's value entirely (bye is handled via the separate `isBye` flag). */
const ZERO_VALUE_STATUSES: ReadonlySet<string> = new Set(["Out", "IR", "Suspended"]);

export interface AvailabilityInput {
  /** Sleeper `injuryStatus`-style string, exact case-sensitive match, or null when healthy. */
  status: string | null;
  isBye: boolean;
  /** The player's value before any availability discount (e.g. the caller's chosen mode's value). */
  rawValue: number;
}

export interface AvailabilityResult {
  value: number;
  reasons: Reason[];
}

/**
 * Applies the LINEUP-4 availability discount to a single player's raw value, returning the
 * adjusted value and the reason(s) explaining any discount. Healthy players pass through
 * unchanged with no reasons.
 */
export function applyAvailability(input: AvailabilityInput): AvailabilityResult {
  const { status, isBye, rawValue } = input;

  if (isBye || (status !== null && ZERO_VALUE_STATUSES.has(status))) {
    const label = isBye ? "On bye this week" : `Status: ${status ?? ""}`;
    return {
      value: 0,
      reasons: [{ code: "UNAVAILABLE", label, impact: -rawValue }],
    };
  }

  if (status === "Doubtful") {
    const multiplier = AVAILABILITY_MULTIPLIERS.doubtful;
    const value = rawValue * multiplier;
    return {
      value,
      reasons: [
        {
          code: "DOUBTFUL_DISCOUNT",
          label: "Doubtful: value discounted",
          value: multiplier,
          impact: value - rawValue,
        },
      ],
    };
  }

  if (status === "Questionable") {
    const multiplier = AVAILABILITY_MULTIPLIERS.questionable;
    const value = rawValue * multiplier;
    return {
      value,
      reasons: [
        {
          code: "QUESTIONABLE_DISCOUNT",
          label: "Questionable: value discounted",
          value: multiplier,
          impact: value - rawValue,
        },
      ],
    };
  }

  return { value: rawValue, reasons: [] };
}
