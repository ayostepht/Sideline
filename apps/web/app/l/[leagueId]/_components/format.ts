import type {
  LineupPlayer,
  PlayerDetailResponse,
  Reason,
  StandingsRow,
  TeamPlayerRow,
  WaiverCandidate,
} from "@sideline/shared";

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

/** One decimal, always signed ("+3.4 pts", "-1.2 pts"). Mirrors the Waivers page's own identical
 * helper (house pattern: small formatters are duplicated per feature, not shared). */
export function formatSignedPoints(n: number): string {
  const abs = Math.abs(n).toFixed(1);
  return n < 0 ? `-${abs} pts` : `+${abs} pts`;
}

/**
 * Home's waiver-targets card (PLAN 6.4): the top `limit` candidates from `getWaivers`'s `forMyTeam`
 * view with a positive Lineup Impact only. Mirrors the Waivers page's own
 * `topTargetSummary` guard (`waivers/_components/format.ts`): a candidate whose Lineup Impact is
 * zero or negative would make the lineup worse, so it is never presented as a recommendation here
 * either. `forMyTeam` is already sorted by Lineup Impact descending, so this is filter-then-slice.
 */
export function topWaiverTargets(
  forMyTeam: readonly WaiverCandidate[],
  limit = 3,
): WaiverCandidate[] {
  return forMyTeam.filter((c) => c.lineupImpact > 0).slice(0, limit);
}

/** One row of Home's "rising players" card: a player (roster or free agent) whose trend signal is
 * Rising, trimmed to what the card shows. Every row is Rising by construction (see
 * {@link risingRosterPlayers}/{@link risingFreeAgents}), so callers don't need to re-check the
 * signal. */
export interface RiserRow {
  playerId: string;
  name: string;
  position: string | null;
  nflTeam: string | null;
  source: "roster" | "freeAgent";
}

/** My-roster half of Home's risers card: players from `getPlayerDetail` (called once per roster
 * player) whose TREND-4 `signal` is Rising. */
export function risingRosterPlayers(details: readonly PlayerDetailResponse[]): RiserRow[] {
  return details
    .filter((d) => d.signal === "Rising")
    .map((d) => ({
      playerId: d.playerId,
      name: d.name,
      position: d.position,
      nflTeam: d.nflTeam,
      source: "roster",
    }));
}

/** Free-agent half of Home's risers card: `WaiverCandidate`s (from `getWaivers`'s `bestAvailable`
 * view, which carries every prefiltered candidate sorted by rest-of-season value) whose own
 * `trendSignal` is Rising. This is a genuine per-candidate signal (TREND-4, not a reconstruction
 * from the opaque Waiver Score composite). */
export function risingFreeAgents(candidates: readonly WaiverCandidate[]): RiserRow[] {
  return candidates
    .filter((c) => c.trendSignal === "Rising")
    .map((c) => ({
      playerId: c.playerId,
      name: c.name,
      position: c.position,
      nflTeam: c.nflTeam,
      source: "freeAgent",
    }));
}

/** Combines both halves of Home's risers card, roster players first (most actionable for the
 * user's own team), capped to `limit` total rows. */
export function selectRisers(
  rosterRisers: readonly RiserRow[],
  freeAgentRisers: readonly RiserRow[],
  limit = 5,
): RiserRow[] {
  return [...rosterRisers, ...freeAgentRisers].slice(0, limit);
}
