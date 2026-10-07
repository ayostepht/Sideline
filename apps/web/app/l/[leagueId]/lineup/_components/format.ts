import type {
  LineupMode,
  LineupModeChoice,
  LineupPlayer,
  LineupSwap,
  StandingsRow,
} from "@sideline/shared";
import { hasMaterialSwaps } from "../../../../../lib/client/lineup-recommendation";
import { leagueBase } from "../../../../../lib/client/nav";

export { hasMaterialSwaps };

export const MODE_CHOICES: readonly LineupModeChoice[] = ["auto", "projected", "safe", "upside"];

export const MODE_LABEL: Record<LineupModeChoice, string> = {
  auto: "Auto",
  projected: "Projected",
  safe: "Safe",
  upside: "Upside",
};

/** What the per-player stat column means in each mode. */
export const MODE_STAT_LABEL: Record<LineupMode, string> = {
  projected: "Proj pts",
  safe: "Safe pts",
  upside: "Upside pts",
};

/** A valid lineup mode choice from a `?mode=` query param, else the default "auto" (LINEUP-5, AUTO-1). */
export function parseMode(raw: string | readonly string[] | null | undefined): LineupModeChoice {
  const v = typeof raw === "string" || raw == null ? raw : raw[0];
  return v !== undefined && v !== null && (MODE_CHOICES as readonly string[]).includes(v)
    ? (v as LineupModeChoice)
    : "auto";
}

/** A positive integer roster id from a `?roster=` query param, else undefined (the viewer's own). */
export function parseRosterId(
  raw: string | readonly string[] | null | undefined,
): number | undefined {
  const v = typeof raw === "string" || raw == null ? raw : raw[0];
  if (typeof v !== "string" || !/^\d+$/.test(v)) return undefined;
  const n = Number(v);
  return n > 0 ? n : undefined;
}

/** One decimal place, no sign. The caller applies `tabular-nums`. */
export function formatValue(n: number): string {
  return n.toFixed(1);
}

/** Signed points with one decimal, always showing a sign ("+3.4 pts", "-1.2 pts", "+0.0 pts"). */
export function formatSignedPoints(n: number): string {
  const abs = Math.abs(n).toFixed(1);
  return n < 0 ? `-${abs} pts` : `+${abs} pts`;
}

export function playerById(
  players: readonly LineupPlayer[],
  id: string | null,
): LineupPlayer | null {
  if (id === null) return null;
  return players.find((p) => p.playerId === id) ?? null;
}

/**
 * Optimal-in value minus current-out value for one swap. Null means a real data gap (a named
 * player id that isn't in `players`), not an intentionally empty slot: a null `playerId` on
 * either side of the swap counts as 0, since that is a known fact, not a fabricated number.
 */
export function swapDelta(players: readonly LineupPlayer[], swap: LineupSwap): number | null {
  const inPlayer = swap.playerIdIn === null ? null : playerById(players, swap.playerIdIn);
  const outPlayer = swap.playerIdOut === null ? null : playerById(players, swap.playerIdOut);
  if (swap.playerIdIn !== null && inPlayer === null) return null;
  if (swap.playerIdOut !== null && outPlayer === null) return null;
  return (inPlayer?.value ?? 0) - (outPlayer?.value ?? 0);
}

/** The plain-language headline for the lineup summary banner (LINEUP-6, insight-first). */
export function lineupSummary(pointDelta: number, swapCount: number): string {
  if (!hasMaterialSwaps(pointDelta, swapCount)) return "Your lineup is already optimal";
  const n = swapCount === 1 ? "1 swap" : `${swapCount} swaps`;
  return `${n} available, projected ${formatSignedPoints(pointDelta)}`;
}

/** Path and query for the lineup page with the given week/mode/roster (`auto` is the default, so omitted); nothing else carries over. */
export function buildLineupHref(
  leagueId: string,
  opts: { week: number | null; mode: LineupModeChoice; roster?: number },
): string {
  const params = new URLSearchParams();
  if (opts.week !== null) params.set("week", String(opts.week));
  if (opts.mode !== "auto") params.set("mode", opts.mode);
  if (opts.roster !== undefined) params.set("roster", String(opts.roster));
  const qs = params.toString();
  return `${leagueBase(leagueId)}/lineup${qs ? `?${qs}` : ""}`;
}

type StandingsLookupRow = Pick<StandingsRow, "rosterId" | "teamName">;

/** The team name for a roster id, or a fallback label when standings are unavailable. */
export function teamNameFor(rows: readonly StandingsLookupRow[], rosterId: number): string {
  return rows.find((r) => r.rosterId === rosterId)?.teamName ?? `Team ${rosterId}`;
}

type MineLookupRow = Pick<StandingsRow, "rosterId" | "isMine">;

/** Whether the given roster id is the stored user's own team. */
export function isMineRoster(rows: readonly MineLookupRow[], rosterId: number): boolean {
  return rows.find((r) => r.rosterId === rosterId)?.isMine ?? false;
}

type RosterLookupRow = Pick<StandingsRow, "rosterId">;

/** Whether the given roster id is a real roster in the league (distinguishes a bad `?roster=`
 * from genuine preseason, since `getLineup`'s "not_found" reason covers both). */
export function rosterExists(rows: readonly RosterLookupRow[], rosterId: number): boolean {
  return rows.some((r) => r.rosterId === rosterId);
}
