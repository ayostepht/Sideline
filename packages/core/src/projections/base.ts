/**
 * PROJ-1 (PLAN 5.2): the base weekly projection. Delegates to {@link rescoreProjection}
 * (SCORE-3) when a projection row exists; when it does not (bye week, inactive player, or
 * Sleeper simply has no projection for this player-week), returns 0 points flagged with a
 * `NO_PROJECTION` reason so the UI can show the player has no usable projection this week.
 */
import type { Reason } from "@sideline/shared";
import { rescoreProjection } from "../scoring/rescore-projection.js";

export interface BaseProjectionInput {
  stats: Record<string, number> | undefined;
  scoringSettings: Record<string, number>;
}

export interface BaseProjectionResult {
  points: number;
  reasons: Reason[];
}

export function baseProjection(input: BaseProjectionInput): BaseProjectionResult {
  const { stats, scoringSettings } = input;
  if (stats === undefined) {
    return {
      points: 0,
      reasons: [
        {
          code: "NO_PROJECTION",
          label: "No projection available this week",
          impact: 0,
        },
      ],
    };
  }
  return rescoreProjection({ stats, scoringSettings });
}
