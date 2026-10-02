/** Sleeper uses LAR where nflverse (the schedule) uses LA (docs/sleeper-api-notes.md 14e). */
export function scheduleTeamCode(sleeperTeam: string): string {
  return sleeperTeam === "LAR" ? "LA" : sleeperTeam;
}
