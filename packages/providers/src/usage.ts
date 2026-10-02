import { type UsageWeek, UsageWeekSchema } from "@sideline/shared";
import { type CsvTable, missingColumns, numOrNull } from "./csv.js";
import { toSleeperTeam } from "./schedule.js";
import type { PlayerRef } from "./types.js";

/** First-name variants, nickname to canonical. Extend as misses show up (ADR-006 item 5). */
export const FIRST_NAME_ALIASES: Readonly<Record<string, string>> = {
  joshua: "josh",
  matthew: "matt",
};

/** NFD accent strip, lowercase, drop punctuation and generational suffixes, collapse spaces. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/[^a-z]+/g, " ")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function aliasName(normalized: string): string {
  const [first = "", ...rest] = normalized.split(" ");
  return [FIRST_NAME_ALIASES[first] ?? first, ...rest].join(" ");
}

export const STATS_COLUMNS = [
  "player_id",
  "player_display_name",
  "position",
  "season",
  "week",
  "game_id",
  "team",
  "carries",
  "targets",
  "target_share",
  "air_yards_share",
] as const;
export const SNAP_COLUMNS = [
  "season",
  "week",
  "player",
  "position",
  "team",
  "offense_pct",
] as const;

interface Index {
  byGsis: Map<string, PlayerRef>;
  exact: Map<string, PlayerRef[]>;
  aliased: Map<string, PlayerRef[]>;
}

function push(map: Map<string, PlayerRef[]>, key: string, p: PlayerRef): void {
  map.set(key, [...(map.get(key) ?? []), p]);
}

function buildIndex(players: readonly PlayerRef[]): Index {
  const idx: Index = { byGsis: new Map(), exact: new Map(), aliased: new Map() };
  for (const p of players) {
    const gsis = p.gsisId?.trim();
    if (gsis) idx.byGsis.set(gsis, p);
    if (p.team) {
      const n = normalizeName(p.fullName);
      push(idx.exact, `${n}|${p.team}`, p);
      push(idx.aliased, `${aliasName(n)}|${p.team}`, p);
    }
  }
  return idx;
}

type Resolution = { kind: "match"; player: PlayerRef } | { kind: "ambiguous" } | { kind: "none" };

function pick(candidates: PlayerRef[] | undefined, position: string): Resolution | null {
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1 && candidates[0]) return { kind: "match", player: candidates[0] };
  const same = candidates.filter((c) => c.position === position);
  if (same.length === 1 && same[0]) return { kind: "match", player: same[0] };
  return { kind: "ambiguous" };
}

function resolve(
  idx: Index,
  gsis: string,
  name: string,
  team: string,
  position: string,
): Resolution {
  const byId = gsis === "" ? undefined : idx.byGsis.get(gsis);
  if (byId) return { kind: "match", player: byId };
  const n = normalizeName(name);
  return (
    pick(idx.exact.get(`${n}|${team}`), position) ??
    pick(idx.aliased.get(`${aliasName(n)}|${team}`), position) ?? { kind: "none" }
  );
}

export interface UsageJoin {
  data: UsageWeek[];
  stats: { statsRows: number; matched: number; ambiguous: number; unmatched: number };
  warnings: string[];
}

/** Joins nflverse stats (and optional snap counts) to Sleeper players. Pure. */
export function joinUsage(
  statsTable: CsvTable,
  snapTable: CsvTable | null,
  season: number,
  weeks: readonly number[] | undefined,
  players: readonly PlayerRef[],
): UsageJoin | { error: string } {
  const missing = missingColumns(statsTable, STATS_COLUMNS);
  if (missing.length > 0) return { error: `stats csv missing columns: ${missing.join(", ")}` };
  const warnings: string[] = [];
  if (statsTable.raggedRows > 0)
    warnings.push(`usage: ${statsTable.raggedRows} ragged stats rows rejected`);
  const wanted = (r: Record<string, string>): boolean =>
    Number(r["season"]) === season && (weeks === undefined || weeks.includes(Number(r["week"])));
  const idx = buildIndex(players);
  const statsRows = statsTable.rows.filter(wanted);

  const teamCarries = new Map<string, number>();
  for (const r of statsRows) {
    const key = `${r["game_id"]}|${r["team"]}`;
    teamCarries.set(key, (teamCarries.get(key) ?? 0) + (numOrNull(r["carries"]) ?? 0));
  }

  const out = new Map<string, UsageWeek>();
  const blank = (week: number, playerId: string, team: string): UsageWeek => ({
    season,
    week,
    playerId,
    team,
    snapPct: null,
    targets: null,
    targetShare: null,
    airYardsShare: null,
    carries: null,
    carryShare: null,
    rzTouches: null,
  });
  const stats = { statsRows: statsRows.length, matched: 0, ambiguous: 0, unmatched: 0 };
  const ambiguousNames = new Set<string>();
  for (const r of statsRows) {
    const team = toSleeperTeam(r["team"] ?? "");
    const res = resolve(
      idx,
      (r["player_id"] ?? "").trim(),
      r["player_display_name"] ?? "",
      team,
      r["position"] ?? "",
    );
    if (res.kind === "ambiguous") {
      stats.ambiguous += 1;
      ambiguousNames.add(`${r["player_display_name"]} (${team})`);
      continue;
    }
    if (res.kind === "none") {
      stats.unmatched += 1;
      continue;
    }
    stats.matched += 1;
    const week = Number(r["week"]);
    const carries = numOrNull(r["carries"]);
    const total = teamCarries.get(`${r["game_id"]}|${r["team"]}`) ?? 0;
    out.set(`${week}|${res.player.playerId}`, {
      ...blank(week, res.player.playerId, team),
      targets: numOrNull(r["targets"]),
      targetShare: numOrNull(r["target_share"]),
      airYardsShare: numOrNull(r["air_yards_share"]),
      carries,
      carryShare: carries === null || total <= 0 ? null : carries / total,
    });
  }

  let snapUnmatched = 0;
  if (snapTable) {
    const snapMissing = missingColumns(snapTable, SNAP_COLUMNS);
    if (snapMissing.length > 0)
      warnings.push(`usage: snap counts missing columns: ${snapMissing.join(", ")}`);
    else {
      if (snapTable.raggedRows > 0)
        warnings.push(`usage: ${snapTable.raggedRows} ragged snap rows rejected`);
      for (const r of snapTable.rows.filter(wanted)) {
        const team = toSleeperTeam(r["team"] ?? "");
        const res = resolve(idx, "", r["player"] ?? "", team, r["position"] ?? "");
        if (res.kind === "ambiguous") ambiguousNames.add(`${r["player"]} (${team})`);
        if (res.kind !== "match") {
          snapUnmatched += 1;
          continue;
        }
        const week = Number(r["week"]);
        const key = `${week}|${res.player.playerId}`;
        const row = out.get(key) ?? blank(week, res.player.playerId, team);
        out.set(key, { ...row, snapPct: numOrNull(r["offense_pct"]) });
      }
    }
  }

  if (stats.unmatched > 0)
    warnings.push(
      `usage: ${stats.unmatched} of ${stats.statsRows} stats rows matched no Sleeper player`,
    );
  if (snapUnmatched > 0)
    warnings.push(`usage: ${snapUnmatched} snap rows matched no Sleeper player`);
  if (ambiguousNames.size > 0)
    warnings.push(`usage: ambiguous player match skipped: ${[...ambiguousNames].join(", ")}`);

  const data: UsageWeek[] = [];
  let invalid = 0;
  for (const row of out.values()) {
    const parsed = UsageWeekSchema.safeParse(row);
    if (parsed.success) data.push(parsed.data);
    else invalid += 1;
  }
  if (invalid > 0) warnings.push(`usage: ${invalid} rows failed schema validation`);
  data.sort((a, b) => a.week - b.week || a.playerId.localeCompare(b.playerId));
  return { data, stats, warnings };
}
