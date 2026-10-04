/**
 * LEAGUE-1 (PLAN 5.8): all-play record per team, per week and season.
 *
 * "All-play" compares a team's score in a given week against every OTHER team's score in that
 * same week (not just the team's real opponent): one win/loss/tie is recorded against each other
 * team that had a score that week. This is a standard fantasy-analytics way to separate "how good
 * is this team really" from "how lucky was the real schedule" (see LEAGUE-2, `luck.ts`, which
 * consumes the per-week win rate this module exposes).
 *
 * Per-week win rate: `(wins + 0.5 * ties) / gamesPlayed`, where `gamesPlayed` is the number of
 * other teams compared against that week (one less than the number of teams with a score that
 * week, since a team never plays itself). A week with fewer than 2 teams scoring (e.g. a
 * single-team fixture, or a week where every other roster's score happens to be missing) has
 * `gamesPlayed = 0` and `winRate = 0`, flagged with reason `LEAGUE_ALL_PLAY_NO_OPPONENTS` rather
 * than dividing by zero. The season aggregate sums wins/losses/ties/gamesPlayed across weeks and
 * recomputes the season win rate the same way, flagging `LEAGUE_ALL_PLAY_NO_GAMES` if the team
 * never had an opponent all season.
 *
 * Scores are plain, caller-supplied numbers (already run through the league's scoring engine, per
 * CLAUDE.md section 8 -- never Sleeper's pre-computed `pts_ppr`-style fields) rather than this
 * module reaching into the scoring engine itself.
 */
import type { Reason } from "@sideline/shared";

export interface AllPlayTeamScore {
  rosterId: number;
  /** League-scored points for this team this week. */
  points: number;
}

export interface AllPlayWeekTeamResult {
  rosterId: number;
  wins: number;
  losses: number;
  ties: number;
  /** Number of other teams compared against this week. */
  gamesPlayed: number;
  /** `(wins + 0.5 * ties) / gamesPlayed`; 0 when `gamesPlayed` is 0. */
  winRate: number;
  reasons: Reason[];
}

/** All-play record for every team in a single week's set of scores (LEAGUE-1). */
export function computeAllPlayWeek(scores: readonly AllPlayTeamScore[]): AllPlayWeekTeamResult[] {
  return scores.map((team) => {
    let wins = 0;
    let losses = 0;
    let ties = 0;

    for (const other of scores) {
      if (other.rosterId === team.rosterId) {
        continue;
      }
      if (team.points > other.points) {
        wins += 1;
      } else if (team.points < other.points) {
        losses += 1;
      } else {
        ties += 1;
      }
    }

    const gamesPlayed = wins + losses + ties;
    const reasons: Reason[] = [];
    let winRate = 0;
    if (gamesPlayed === 0) {
      reasons.push({
        code: "LEAGUE_ALL_PLAY_NO_OPPONENTS",
        label: "No other teams had a score this week",
        value: 0,
      });
    } else {
      winRate = (wins + 0.5 * ties) / gamesPlayed;
    }

    return { rosterId: team.rosterId, wins, losses, ties, gamesPlayed, winRate, reasons };
  });
}

export interface AllPlayWeekInput {
  week: number;
  scores: readonly AllPlayTeamScore[];
}

export interface AllPlaySeasonTeamResult {
  rosterId: number;
  wins: number;
  losses: number;
  ties: number;
  gamesPlayed: number;
  /** `(wins + 0.5 * ties) / gamesPlayed` across the whole season; 0 when `gamesPlayed` is 0. */
  winRate: number;
  /** Per-week win rate, in the same (sorted ascending by `week`) order as the supplied weeks.
   * Feeds directly into `luck()` (LEAGUE-2). */
  weeklyWinRates: readonly number[];
  reasons: Reason[];
}

/** Season-aggregated all-play record for every team across every supplied week (LEAGUE-1). */
export function computeAllPlaySeason(
  weeks: readonly AllPlayWeekInput[],
): AllPlaySeasonTeamResult[] {
  const totals = new Map<
    number,
    { wins: number; losses: number; ties: number; gamesPlayed: number; weeklyWinRates: number[] }
  >();

  const sortedWeeks = [...weeks].sort((a, b) => a.week - b.week);

  for (const weekInput of sortedWeeks) {
    const weekResults = computeAllPlayWeek(weekInput.scores);
    for (const result of weekResults) {
      const existing = totals.get(result.rosterId) ?? {
        wins: 0,
        losses: 0,
        ties: 0,
        gamesPlayed: 0,
        weeklyWinRates: [],
      };
      existing.wins += result.wins;
      existing.losses += result.losses;
      existing.ties += result.ties;
      existing.gamesPlayed += result.gamesPlayed;
      existing.weeklyWinRates.push(result.winRate);
      totals.set(result.rosterId, existing);
    }
  }

  return Array.from(totals.entries()).map(([rosterId, t]) => {
    const reasons: Reason[] = [];
    let winRate = 0;
    if (t.gamesPlayed === 0) {
      reasons.push({
        code: "LEAGUE_ALL_PLAY_NO_GAMES",
        label: "No all-play games recorded this season",
        value: 0,
      });
    } else {
      winRate = (t.wins + 0.5 * t.ties) / t.gamesPlayed;
    }
    return {
      rosterId,
      wins: t.wins,
      losses: t.losses,
      ties: t.ties,
      gamesPlayed: t.gamesPlayed,
      winRate,
      weeklyWinRates: t.weeklyWinRates,
      reasons,
    };
  });
}
