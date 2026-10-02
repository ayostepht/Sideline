import type { StandingsRow, TeamPlayerRow } from "@sideline/shared";
import { normalizeInjury } from "../../../../components/injury";

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

export type IssueReason = "out" | "ir" | "bye";

/** Why a starter cannot be counted on this week, or null. Out and IR-type statuses count. */
export function issueReason(p: TeamPlayerRow, week: number | null): IssueReason | null {
  const key = normalizeInjury(p.injuryStatus)?.key;
  if (key === "out") return "out";
  if (key === "ir" || key === "pup") return "ir";
  if (isOnBye(p, week)) return "bye";
  return null;
}

export function countStarterIssues(players: readonly TeamPlayerRow[], week: number | null): number {
  return players.filter((p) => p.slot === "starter" && issueReason(p, week) !== null).length;
}

export function issuesText(count: number): string {
  if (count === 0) return "No lineup issues this week";
  return count === 1 ? "1 starter needs attention" : `${count} starters need attention`;
}

const ISSUE_LABELS: Record<IssueReason, string> = { out: "Out", ir: "IR", bye: "Bye" };

export function issueLabel(reason: IssueReason): string {
  return ISSUE_LABELS[reason];
}

/** Starters that are out, on IR or PUP, or on bye in `week`, with the reason. */
export function starterIssues(
  players: readonly TeamPlayerRow[],
  week: number | null,
): { player: TeamPlayerRow; reason: IssueReason }[] {
  const out: { player: TeamPlayerRow; reason: IssueReason }[] = [];
  for (const player of players) {
    if (player.slot !== "starter") continue;
    const reason = issueReason(player, week);
    if (reason !== null) out.push({ player, reason });
  }
  return out;
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
