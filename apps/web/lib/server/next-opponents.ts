/**
 * OPP-1 (PLAN 6 Players sheet, MATCH-1/MATCH-4): the player's next 4 NFL weeks with the opposing
 * defense's grade against the player's position. Context only (ADR-014: alpha = beta = 0, so
 * projections are not adjusted). Grading is delegated to `matchupGrade` in `@sideline/core` over
 * the same DvP ordering `lineup.ts` uses (rank 1 = allows the most = easiest = grade A).
 *
 * Start week: the stored NFL week when the team's game that week has not kicked off yet (or has no
 * known kickoff); otherwise the following week. Weeks stop at 18.
 */
import { matchupGrade } from "@sideline/core";
import { readNflState, type DbHandle, type FullPlayerRow } from "@sideline/db";
import type { NextOpponents, NextOpponentWeek } from "@sideline/shared";
import { readDefenseVsPosition, toNflverseTeam } from "./lineup";
import { weatherByGame } from "./weather";

export const NEXT_OPPONENT_WEEKS = 4;
const LAST_REGULAR_WEEK = 18;
const NOT_GRADED = new Set(["K", "DEF"]);

export function nextOpponentsFor(
  h: DbHandle,
  leagueId: string,
  season: number,
  player: Pick<FullPlayerRow, "position" | "team">,
  now: Date,
): NextOpponents {
  if (player.team === null) return { weeks: [], reasonUnavailable: "No team" };
  if (player.position === null || NOT_GRADED.has(player.position)) {
    return { weeks: [], reasonUnavailable: "Not graded for kickers and defenses" };
  }
  const state = readNflState(h);
  let current: number;
  if (state === null || state.season < season) current = 1;
  else if (state.season > season) return { weeks: [], reasonUnavailable: null };
  else current = state.week;

  const team = toNflverseTeam(player.team);
  const games = h.sqlite
    .prepare(
      `SELECT week, game_id AS gameId, home, away, kickoff_utc AS kickoffUtc FROM schedule
       WHERE season = ? AND week BETWEEN ? AND ? AND (home = ? OR away = ?)`,
    )
    .all(season, current, LAST_REGULAR_WEEK, team, team) as {
    week: number;
    gameId: string;
    home: string;
    away: string;
    kickoffUtc: string | null;
  }[];
  const byWeek = new Map(games.map((g) => [g.week, g] as const));
  const populated = new Set(
    (
      h.sqlite
        .prepare("SELECT DISTINCT week FROM schedule WHERE season = ? AND week BETWEEN ? AND ?")
        .all(season, current, LAST_REGULAR_WEEK) as { week: number }[]
    ).map((r) => r.week),
  );

  const currentGame = byWeek.get(current);
  const kicked =
    currentGame?.kickoffUtc != null && Date.parse(currentGame.kickoffUtc) <= now.getTime();
  // A bye in the current week is not "complete" either, but listing it is still useful.
  const start = kicked ? current + 1 : current;

  const dvp = readDefenseVsPosition(h, leagueId, season, LAST_REGULAR_WEEK).get(player.position);
  const weeks: NextOpponentWeek[] = [];
  const gameIdByWeek = new Map<number, string>();
  for (
    let week = start;
    week <= LAST_REGULAR_WEEK && weeks.length < NEXT_OPPONENT_WEEKS;
    week += 1
  ) {
    const g = byWeek.get(week);
    if (g === undefined) {
      if (populated.has(week)) weeks.push(emptyWeek(week, true));
      continue; // schedule not loaded for this week: skip
    }
    const opponent = g.home === team ? g.away : g.home;
    const row: NextOpponentWeek = { ...emptyWeek(week, false), opponent, home: g.home === team };
    const idx = dvp === undefined ? -1 : dvp.findIndex((e) => e.team === opponent);
    if (dvp !== undefined && idx !== -1) {
      const gr = matchupGrade(idx + 1, dvp.length);
      row.grade = gr.grade;
      row.gradeLabel = gr.label;
      row.ptsAllowedPg = dvp[idx]?.ptsAllowedPg ?? null;
      row.rank = idx + 1;
      row.totalTeams = dvp.length;
    }
    gameIdByWeek.set(week, g.gameId);
    weeks.push(row);
  }
  // WX-4: one batched forecast read for the listed games. Context only.
  const weather = weatherByGame(
    h,
    season,
    [...gameIdByWeek].map(([week, gameId]) => ({
      gameId,
      week,
      kickoffUtc: byWeek.get(week)?.kickoffUtc ?? null,
    })),
    now,
  );
  for (const w of weeks) {
    const id = gameIdByWeek.get(w.week);
    if (id !== undefined) w.weather = weather.get(id) ?? null;
  }
  return { weeks, reasonUnavailable: null };
}

function emptyWeek(week: number, bye: boolean): NextOpponentWeek {
  return {
    week,
    bye,
    opponent: null,
    home: null,
    grade: null,
    gradeLabel: null,
    ptsAllowedPg: null,
    rank: null,
    totalTeams: null,
    weather: null,
  };
}
