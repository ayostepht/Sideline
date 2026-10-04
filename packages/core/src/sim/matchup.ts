/**
 * SIM-1/SIM-2/SIM-3 (PLAN 5.7): Monte Carlo simulation of a head-to-head fantasy matchup.
 *
 * Per iteration, per starter:
 * - `finished`: fixed at `actualPointsSoFar`. Zero variance, never drawn from.
 * - `not_started`: drawn from a normal distribution truncated at 0 (see `rng.ts`) around `mean`
 *   with standard deviation `sd` (PROJ-2's `weeklyStandardDeviation`, supplied by the caller).
 * - `in_progress`: `actualPointsSoFar` plus a non-negative random remaining component.
 *   - When `fractionOfGameRemaining` is known: the remaining component is drawn from a
 *     truncated-at-0 normal with mean `mean * fractionOfGameRemaining` and standard deviation
 *     `sd * sqrt(fractionOfGameRemaining)`. The sqrt-of-fraction scaling (rather than a linear
 *     scaling of sd, or leaving sd unscaled) is the principled choice here: modeling the
 *     remaining production as an accumulation of many small, independent contributions over the
 *     remaining game time (snaps, plays, targets) means its *variance* scales linearly with the
 *     fraction of time remaining (think a sum of i.i.d. increments, or a Brownian motion's
 *     variance growing linearly with elapsed time), so its standard deviation scales with the
 *     *square root* of that fraction. This also gives the right boundary behavior: at
 *     `fractionOfGameRemaining = 0` the remaining component is deterministically 0 (the game is
 *     over), and at `fractionOfGameRemaining = 1` it reduces exactly to the `not_started` case.
 *   - When `fractionOfGameRemaining` is `null` (no game-clock data available), PLAN 5.7 (SIM-1)
 *     says to "treat as actual plus full remaining projection" and flag it approximate: the
 *     remaining component is drawn exactly as a `not_started` player's full distribution
 *     (mean `mean`, sd `sd`), and a `SIM_REMAINING_APPROXIMATE` reason is attached.
 *
 * Swing players (SIM-2): because every starter's score is drawn independently of every other
 * starter (no cross-player correlation is modeled), the variance of the score differential
 * (team A total minus team B total) decomposes exactly into the sum of each starter's own score
 * variance: Var(diff) = Var(sum_i x_i - sum_j y_j) = sum_i Var(x_i) + sum_j Var(y_j), with no
 * covariance cross-terms. So each starter's "contribution to the variance of the score
 * difference" is simply the empirical variance of that starter's simulated score across
 * iterations (computed as a running sum/sum-of-squares per starter, not a stored per-iteration
 * array, to keep the hot loop allocation-free for SIM-3's 300ms budget). Finished players have
 * zero variance by construction and always sort to the bottom.
 */
import type { Reason } from "@sideline/shared";
import { sampleTruncatedNormalAtZero, createRng } from "./rng.js";

/** Default Monte Carlo iteration count (SIM-1, SIM-3). */
export const DEFAULT_SIM_ITERATIONS = 10000;

export type SimStarterStatus = "not_started" | "in_progress" | "finished";

/** Fields common to every `SimStarter` status variant. */
interface SimStarterCommon {
  playerId: string;
  /** Mean (mode-adjusted) weekly projection. Ignored for `finished` players. */
  mean: number;
  /** PROJ-2 standard deviation. Ignored for `finished` players. */
  sd: number;
}

/**
 * Discriminated union on `status` (code-reviewer Major finding, T5.1 fix round): `finished` and
 * `in_progress` each *require* `actualPointsSoFar`, so a caller that omits it for a player who
 * actually scored points cannot silently fall back to 0 with no trace. The omission is now a
 * compile error, not a runtime concern that only `flattenStarter`'s fallback would mask.
 * `not_started` cannot carry `actualPointsSoFar` or `fractionOfGameRemaining` at all, since
 * neither is meaningful before the player's game begins.
 */
export type SimStarter =
  | (SimStarterCommon & { status: "not_started" })
  | (SimStarterCommon & {
      status: "finished";
      /** Points already scored. Final for `finished`: never redrawn. */
      actualPointsSoFar: number;
    })
  | (SimStarterCommon & {
      status: "in_progress";
      /** Points already scored so far this week. */
      actualPointsSoFar: number;
      /**
       * Fraction of the player's game clock remaining, in [0, 1]. `null` means no game-clock
       * data was available (SIM-1's "otherwise" branch).
       */
      fractionOfGameRemaining?: number | null;
    });

export interface SimTeam {
  rosterId: string;
  starters: readonly SimStarter[];
}

export interface SimulateMatchupInput {
  teamA: SimTeam;
  teamB: SimTeam;
  /** Monte Carlo iteration count. Defaults to {@link DEFAULT_SIM_ITERATIONS} (SIM-1). Any value
   * less than 1 falls back to the default rather than dividing by zero downstream. */
  iterations?: number;
  /** Required seed (CLAUDE.md section 8: RNG seeds are always passed in by the caller). */
  seed: number;
}

export interface SimScoreQuantiles {
  p10: number;
  p50: number;
  p90: number;
}

export interface SwingPlayer {
  playerId: string;
  rosterId: string;
  /** This starter's empirical variance across iterations: its contribution to Var(score diff). */
  varianceContribution: number;
}

export interface SimulateMatchupResult {
  winProbabilityTeamA: number;
  winProbabilityTeamB: number;
  tieProbability: number;
  teamA: SimScoreQuantiles;
  teamB: SimScoreQuantiles;
  /** Descending by `varianceContribution`; finished (zero-variance) players sort to the bottom. */
  swingPlayers: SwingPlayer[];
  reasons: Reason[];
}

/**
 * Linear interpolation between closest ranks (same convention as `projections/floor-ceiling.ts`'s
 * empirical-quantile path): for a sorted ascending array and a percentile `p` in [0, 1],
 * `index = p * (n - 1)`, interpolated between the two nearest ranks.
 */
function empiricalPercentile(sortedAscending: Float64Array, p: number): number {
  const n = sortedAscending.length;
  const index = p * (n - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const lowerValue = sortedAscending[lower] as number;
  const upperValue = sortedAscending[upper] as number;
  return lowerValue + (upperValue - lowerValue) * (index - lower);
}

/** Internal, flattened, allocation-free-per-iteration representation of one starter. */
interface FlatStarter {
  playerId: string;
  rosterId: string;
  team: 0 | 1;
  /** Points added every iteration unconditionally (actual points, or 0 for not-yet-started). */
  fixedBase: number;
  /** Mean for the truncated-normal draw. Unused when `drawSd` is negative (finished: no draw). */
  drawMean: number;
  /** sd for the truncated-normal draw. Negative is the "no draw" sentinel (finished players). */
  drawSd: number;
}

const NO_DRAW = -1;

function flattenStarter(
  team: 0 | 1,
  rosterId: string,
  starter: SimStarter,
  reasons: Reason[],
): FlatStarter {
  const { playerId, mean, sd, status } = starter;

  switch (status) {
    case "finished":
      return {
        playerId,
        rosterId,
        team,
        fixedBase: starter.actualPointsSoFar,
        drawMean: 0,
        drawSd: NO_DRAW,
      };

    case "not_started":
      return { playerId, rosterId, team, fixedBase: 0, drawMean: mean, drawSd: sd };

    case "in_progress": {
      const base = starter.actualPointsSoFar;
      const { fractionOfGameRemaining } = starter;
      if (fractionOfGameRemaining === null || fractionOfGameRemaining === undefined) {
        reasons.push({
          code: "SIM_REMAINING_APPROXIMATE",
          label:
            "No live game clock data, so the rest of this player's score uses the full projection",
          value: playerId,
        });
        return { playerId, rosterId, team, fixedBase: base, drawMean: mean, drawSd: sd };
      }

      const fraction = Math.min(1, Math.max(0, fractionOfGameRemaining));
      return {
        playerId,
        rosterId,
        team,
        fixedBase: base,
        drawMean: mean * fraction,
        drawSd: sd * Math.sqrt(fraction),
      };
    }
  }
}

export function simulateMatchup(input: SimulateMatchupInput): SimulateMatchupResult {
  const { teamA, teamB, seed } = input;
  const iterations =
    input.iterations !== undefined && input.iterations >= 1
      ? Math.floor(input.iterations)
      : DEFAULT_SIM_ITERATIONS;

  const reasons: Reason[] = [];
  const flat: FlatStarter[] = [
    ...teamA.starters.map((s) => flattenStarter(0, teamA.rosterId, s, reasons)),
    ...teamB.starters.map((s) => flattenStarter(1, teamB.rosterId, s, reasons)),
  ];
  const n = flat.length;

  const fixedBase = new Float64Array(n);
  const drawMean = new Float64Array(n);
  const drawSd = new Float64Array(n);
  const teamOf = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const f = flat[i] as FlatStarter;
    fixedBase[i] = f.fixedBase;
    drawMean[i] = f.drawMean;
    drawSd[i] = f.drawSd;
    teamOf[i] = f.team;
  }

  const playerSum = new Float64Array(n);
  const playerSumSq = new Float64Array(n);
  const totalsA = new Float64Array(iterations);
  const totalsB = new Float64Array(iterations);

  const next = createRng(seed);
  let winA = 0;
  let winB = 0;
  let tie = 0;

  for (let it = 0; it < iterations; it++) {
    let totalA = 0;
    let totalB = 0;
    for (let i = 0; i < n; i++) {
      const sd = drawSd[i] as number;
      let value = fixedBase[i] as number;
      if (sd !== NO_DRAW) {
        value += sampleTruncatedNormalAtZero(next, drawMean[i] as number, sd);
      }
      playerSum[i] = (playerSum[i] as number) + value;
      playerSumSq[i] = (playerSumSq[i] as number) + value * value;
      if (teamOf[i] === 0) {
        totalA += value;
      } else {
        totalB += value;
      }
    }
    totalsA[it] = totalA;
    totalsB[it] = totalB;
    if (totalA > totalB) {
      winA++;
    } else if (totalB > totalA) {
      winB++;
    } else {
      tie++;
    }
  }

  const swingPlayers: SwingPlayer[] = flat.map((f, i) => {
    const mean = (playerSum[i] as number) / iterations;
    const meanSq = (playerSumSq[i] as number) / iterations;
    const varianceContribution = Math.max(0, meanSq - mean * mean);
    return { playerId: f.playerId, rosterId: f.rosterId, varianceContribution };
  });
  swingPlayers.sort((a, b) => b.varianceContribution - a.varianceContribution);

  const sortedA = Float64Array.from(totalsA).sort();
  const sortedB = Float64Array.from(totalsB).sort();

  return {
    winProbabilityTeamA: winA / iterations,
    winProbabilityTeamB: winB / iterations,
    tieProbability: tie / iterations,
    teamA: {
      p10: empiricalPercentile(sortedA, 0.1),
      p50: empiricalPercentile(sortedA, 0.5),
      p90: empiricalPercentile(sortedA, 0.9),
    },
    teamB: {
      p10: empiricalPercentile(sortedB, 0.1),
      p50: empiricalPercentile(sortedB, 0.5),
      p90: empiricalPercentile(sortedB, 0.9),
    },
    swingPlayers,
    reasons,
  };
}
