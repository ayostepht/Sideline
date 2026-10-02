import { type ScheduleGame, ScheduleGameSchema } from "@sideline/shared";
import { type CsvTable, missingColumns, numOrNull } from "./csv.js";

/** nflverse team code to Sleeper team code. Only the Rams differ (ADR-006 item 4). */
export const NFLVERSE_TO_SLEEPER_TEAM: Readonly<Record<string, string>> = { LA: "LAR" };

export const SLEEPER_TEAMS: ReadonlySet<string> = new Set(
  "ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LAC LAR LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS".split(
    " ",
  ),
);

export function toSleeperTeam(code: string): string {
  const c = code.trim();
  return NFLVERSE_TO_SLEEPER_TEAM[c] ?? c;
}

const etFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
});

/** America/New_York offset from UTC in minutes at an instant (-240 EDT, -300 EST). */
function etOffsetMinutes(utcMs: number): number {
  const p: Record<string, number> = {};
  for (const part of etFormatter.formatToParts(new Date(utcMs))) p[part.type] = Number(part.value);
  const asUtc = Date.UTC(
    p["year"] ?? 0,
    (p["month"] ?? 1) - 1,
    p["day"] ?? 1,
    p["hour"] ?? 0,
    p["minute"] ?? 0,
  );
  return Math.round((asUtc - Math.floor(utcMs / 60_000) * 60_000) / 60_000);
}

/**
 * Kickoff instant for America/New_York wall-clock `gameday` (YYYY-MM-DD) and `gametime` (HH:MM).
 * Returns null for missing or invalid input (ranges checked, date round-tripped so 2026-02-31 and
 * hour 25 are rejected). Ambiguous fall-back hour (01:30 on the first Sunday of November) resolves to
 * the first occurrence (EDT). A nonexistent spring-forward time (02:30 in March) resolves as if the
 * clock had already moved (EST offset, so 02:30 becomes 03:30 EDT).
 */
export function kickoffUtc(gameday: string, gametime: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(gameday.trim());
  const t = /^(\d{1,2}):(\d{2})$/.exec(gametime.trim());
  if (!d || !t) return null;
  const [y, mo, da, h, mi] = [d[1], d[2], d[3], t[1], t[2]].map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || h > 23 || mi > 59) return null;
  const wall = Date.UTC(y, mo - 1, da, h, mi);
  const back = new Date(wall);
  if (back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== da) return null;
  const edt = wall + 240 * 60_000;
  const est = wall + 300 * 60_000;
  if (etOffsetMinutes(edt) === -240) return new Date(edt).toISOString();
  return new Date(est).toISOString();
}

/** Positive `spread` means the home team is favored (ADR-006 item 3). */
export function impliedTotals(spread: number, total: number): { home: number; away: number } {
  return { home: total / 2 + spread / 2, away: total / 2 - spread / 2 };
}

/** Team to bye week: the one regular-season week in 1..max where it has no game. */
export function byeWeeks(schedule: readonly ScheduleGame[]): Map<string, number> {
  const reg = schedule.filter((g) => g.gameType === "REG");
  const maxWeek = reg.reduce((m, g) => Math.max(m, g.week), 0);
  const played = new Map<string, Set<number>>();
  for (const g of reg) {
    for (const team of [g.home, g.away]) {
      const set = played.get(team) ?? new Set<number>();
      set.add(g.week);
      played.set(team, set);
    }
  }
  const byes = new Map<string, number>();
  for (const [team, weeks] of played) {
    const missing: number[] = [];
    for (let w = 1; w <= maxWeek; w += 1) if (!weeks.has(w)) missing.push(w);
    const [first] = missing;
    if (missing.length === 1 && first !== undefined) byes.set(team, first);
  }
  return byes;
}

export const SCHEDULE_COLUMNS = [
  "game_id",
  "season",
  "game_type",
  "week",
  "gameday",
  "gametime",
  "away_team",
  "away_score",
  "home_team",
  "home_score",
  "roof",
  "spread_line",
  "total_line",
] as const;

/**
 * Maps nflverse games rows for one season. A missing gametime gives kickoffUtc null and
 * kickoffApproximate true; the worker applies the ADR-002 fallback time, not the provider.
 */
export function mapSchedule(
  table: CsvTable,
  season: number,
): { games: ScheduleGame[]; warnings: string[] } | { error: string } {
  const missing = missingColumns(table, SCHEDULE_COLUMNS);
  if (missing.length > 0) return { error: `games.csv missing columns: ${missing.join(", ")}` };
  const warnings: string[] = [];
  if (table.raggedRows > 0) warnings.push(`schedule: ${table.raggedRows} ragged rows rejected`);
  const unknownTeams = new Set<string>();
  const games: ScheduleGame[] = [];
  let invalid = 0;
  for (const r of table.rows) {
    if (Number(r["season"]) !== season) continue;
    const home = toSleeperTeam(r["home_team"] ?? "");
    const away = toSleeperTeam(r["away_team"] ?? "");
    for (const team of [home, away]) if (!SLEEPER_TEAMS.has(team)) unknownTeams.add(team);
    const kickoff = kickoffUtc(r["gameday"] ?? "", r["gametime"] ?? "");
    const parsed = ScheduleGameSchema.safeParse({
      season,
      week: Number(r["week"]),
      gameId: r["game_id"],
      gameType: r["game_type"],
      home,
      away,
      kickoffUtc: kickoff,
      kickoffApproximate: kickoff === null,
      roof: (r["roof"] ?? "").trim() === "" ? null : r["roof"],
      spreadLine: numOrNull(r["spread_line"]),
      totalLine: numOrNull(r["total_line"]),
      homeScore: numOrNull(r["home_score"]),
      awayScore: numOrNull(r["away_score"]),
    });
    if (parsed.success) games.push(parsed.data);
    else invalid += 1;
  }
  if (invalid > 0) warnings.push(`schedule: ${invalid} invalid rows rejected`);
  if (unknownTeams.size > 0)
    warnings.push(`schedule: unknown team codes kept: ${[...unknownTeams].join(", ")}`);
  return { games, warnings };
}
