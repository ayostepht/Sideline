import type { LineupPlayer, Reason, StandingsRow, TeamPlayerRow } from "@sideline/shared";

/** "7-3" or "7-3-1" when there are ties. */
export function formatRecord(r: Pick<StandingsRow, "wins" | "losses" | "ties">): string {
  return r.ties > 0 ? `${r.wins}-${r.losses}-${r.ties}` : `${r.wins}-${r.losses}`;
}

/** Points with one decimal and thousands separators, fixed locale so server output is stable. */
export function formatPoints(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Top `top` rows, plus the user's row when they sit outside it. Input is already ranked. */
export function selectStandingsSnippet(rows: readonly StandingsRow[], top = 4): StandingsRow[] {
  const head = rows.slice(0, top);
  const mine = rows.find((r) => r.isMine);
  return mine !== undefined && !head.includes(mine) ? [...head, mine] : head;
}

export function isOnBye(p: Pick<TeamPlayerRow, "byeWeek">, week: number | null): boolean {
  return week !== null && p.byeWeek === week;
}

/**
 * Plain-language copy for one of `LineupResponse.issues` (LINEUP-6). `INACTIVE_STARTER`'s raw
 * label only has a player id (`packages/core/src/optimizer/recommend.ts`); substitute the
 * player's name and their actual unavailability reason (bye, out, etc.) when known.
 */
export function lineupIssueLabel(issue: Reason, players: readonly LineupPlayer[]): string {
  if (issue.code === "INACTIVE_STARTER" && typeof issue.value === "string") {
    const player = players.find((p) => p.playerId === issue.value);
    if (player !== undefined) {
      const why = player.reasons.find((r) => r.code === "UNAVAILABLE")?.label;
      return why !== undefined ? `${player.name}: ${why}` : `${player.name} is unavailable`;
    }
  }
  return issue.label;
}

export interface TeamSections {
  starters: TeamPlayerRow[];
  bench: TeamPlayerRow[];
  ir: TeamPlayerRow[];
  taxi: TeamPlayerRow[];
}

export function groupPlayers(players: readonly TeamPlayerRow[]): TeamSections {
  return {
    starters: players.filter((p) => p.slot === "starter"),
    bench: players.filter((p) => p.slot === "bench"),
    ir: players.filter((p) => p.slot === "ir"),
    taxi: players.filter((p) => p.slot === "taxi"),
  };
}

/** Name shown for a player; unknown players (empty name) fall back to their id. */
export function displayName(p: Pick<TeamPlayerRow, "name" | "playerId">): string {
  return p.name.trim() === "" ? `Player ${p.playerId}` : p.name;
}
