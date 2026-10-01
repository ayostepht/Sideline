/**
 * Fixture trimming: pure functions, no I/O.
 *
 * Players: rostered + referenced + top N by search_rank + all DEF, reduced to a field allowlist.
 * Projections and stats rows: every real row, every row in the players set, a deterministic sample
 * of placeholder rows, and all leaked-position rows (FB, P, CB, DB).
 */

/** Fields kept per player. PLAN 4.5 `players` columns plus what T1.2 schemas plausibly need. */
export const PLAYER_FIELDS = [
  "player_id",
  "first_name",
  "last_name",
  "full_name",
  "search_full_name",
  "position",
  "fantasy_positions",
  "team",
  "status",
  "injury_status",
  "injury_body_part",
  "active",
  "age",
  "years_exp",
  "depth_chart_order",
  "depth_chart_position",
  "search_rank",
  "number",
  "gsis_id",
  "news_updated",
  "sport",
] as const;

export const LEAKED_POSITIONS: readonly string[] = ["FB", "P", "CB", "DB"];
export const PLACEHOLDER_SAMPLE_SIZE = 30;
export const TOP_PLAYERS_BY_SEARCH_RANK = 400;
/** Sleeper uses this as "unranked". */
const SEARCH_RANK_SENTINEL = 9_999_999;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? (v as unknown[]) : [];
}

/** Player ids sort numerically first, then team codes alphabetically. */
export function comparePlayerIds(a: string, b: string): number {
  const an = /^\d+$/.test(a);
  const bn = /^\d+$/.test(b);
  if (an && bn) return Number(a) - Number(b);
  if (an) return -1;
  if (bn) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface ReferencedDocs {
  rosters: unknown;
  matchups: readonly unknown[];
  transactions: readonly unknown[];
  draftPicks: readonly unknown[];
  trending: readonly unknown[];
}

/** Every player id (or DEF team code) referenced by the league fixtures. */
export function collectReferencedPlayerIds(docs: ReferencedDocs): Set<string> {
  const ids = new Set<string>();
  const add = (v: unknown): void => {
    if (typeof v === "string" && v.length > 0 && v !== "0") ids.add(v);
  };
  for (const r of asArray(docs.rosters).filter(isRecord)) {
    for (const key of ["players", "starters", "reserve", "taxi", "keepers"]) {
      for (const p of asArray(r[key])) add(p);
    }
  }
  for (const week of docs.matchups) {
    for (const m of asArray(week).filter(isRecord)) {
      for (const p of asArray(m.players)) add(p);
      for (const p of asArray(m.starters)) add(p);
      if (isRecord(m.players_points)) for (const p of Object.keys(m.players_points)) add(p);
    }
  }
  for (const week of docs.transactions) {
    for (const t of asArray(week).filter(isRecord)) {
      for (const key of ["adds", "drops"]) {
        const side = t[key];
        if (isRecord(side)) for (const p of Object.keys(side)) add(p);
      }
    }
  }
  for (const picks of docs.draftPicks) {
    for (const p of asArray(picks).filter(isRecord)) add(p.player_id);
  }
  for (const list of docs.trending) {
    for (const t of asArray(list).filter(isRecord)) add(t.player_id);
  }
  return ids;
}

/** Ids to keep before looking at projections and stats: referenced + top N by rank + all DEF. */
export function selectPlayerIds(
  all: Readonly<Record<string, unknown>>,
  referenced: ReadonlySet<string>,
  topN: number = TOP_PLAYERS_BY_SEARCH_RANK,
): Set<string> {
  const keep = new Set<string>();
  for (const id of referenced) if (id in all) keep.add(id);
  const ranked: { id: string; rank: number }[] = [];
  for (const [id, p] of Object.entries(all)) {
    if (!isRecord(p)) continue;
    if (p.position === "DEF") keep.add(id);
    const rank = p.search_rank;
    if (typeof rank === "number" && rank < SEARCH_RANK_SENTINEL) ranked.push({ id, rank });
  }
  ranked.sort((a, b) => a.rank - b.rank || comparePlayerIds(a.id, b.id));
  for (const r of ranked.slice(0, topN)) keep.add(r.id);
  return keep;
}

/** Reduces each kept player to the field allowlist, ordered by player id. */
export function projectPlayers(
  all: Readonly<Record<string, unknown>>,
  keep: ReadonlySet<string>,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const id of [...keep].sort(comparePlayerIds)) {
    const p = all[id];
    if (!isRecord(p)) continue;
    const slim: Record<string, unknown> = {};
    for (const f of PLAYER_FIELDS) if (f in p) slim[f] = p[f];
    out[id] = slim;
  }
  return out;
}

/**
 * True when a player's full name contains an original manager, team or league name (case-insensitive,
 * names of 4+ characters). Such players are dropped from the players fixture unless a league
 * document references them, so a plain grep for original names stays clean across the repo.
 */
export function playerNameCollides(player: unknown, names: readonly string[]): boolean {
  if (!isRecord(player)) return false;
  const hay = [player.full_name, player.search_full_name]
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.toLowerCase());
  return names.some((n) => {
    const needle = n.toLowerCase();
    return needle.length >= 4 && hay.some((h) => h.includes(needle));
  });
}

export interface RowTrimStats {
  total: number;
  kept: number;
  real: number;
  inPlayerSet: number;
  placeholderSample: number;
  leakedPositions: number;
  /** Number of placeholder rows dropped. */
  dropped: number;
}

function rowPlayerId(row: unknown): string | null {
  return isRecord(row) && typeof row.player_id === "string" ? row.player_id : null;
}

export function isRealRow(row: unknown): boolean {
  return isRecord(row) && isRecord(row.stats) && row.stats.gp !== undefined;
}

function isLeakedPosition(row: unknown): boolean {
  if (!isRecord(row) || !isRecord(row.player)) return false;
  const pos = row.player.position;
  return typeof pos === "string" && LEAKED_POSITIONS.includes(pos);
}

/**
 * Trims one week of projections or stats rows. Deterministic: the placeholder sample is evenly
 * spaced over the remaining placeholder rows sorted by player id.
 */
export function trimRows(
  rows: readonly unknown[],
  playerSet: ReadonlySet<string>,
  sampleSize: number = PLACEHOLDER_SAMPLE_SIZE,
): { rows: unknown[]; stats: RowTrimStats } {
  const stats: RowTrimStats = {
    total: rows.length,
    kept: 0,
    real: 0,
    inPlayerSet: 0,
    placeholderSample: 0,
    leakedPositions: 0,
    dropped: 0,
  };
  const kept: unknown[] = [];
  const candidates: unknown[] = [];
  for (const row of rows) {
    const id = rowPlayerId(row);
    if (id === null) continue;
    if (isRealRow(row)) {
      stats.real += 1;
      kept.push(row);
    } else if (isLeakedPosition(row)) {
      stats.leakedPositions += 1;
      kept.push(row);
    } else if (playerSet.has(id)) {
      stats.inPlayerSet += 1;
      kept.push(row);
    } else {
      candidates.push(row);
    }
  }
  candidates.sort((a, b) => comparePlayerIds(rowPlayerId(a) ?? "", rowPlayerId(b) ?? ""));
  const step = candidates.length > sampleSize ? Math.floor(candidates.length / sampleSize) : 1;
  const sample: unknown[] = [];
  for (let i = 0; i < candidates.length && sample.length < sampleSize; i += step) {
    sample.push(candidates[i]);
  }
  stats.placeholderSample = sample.length;
  stats.dropped = candidates.length - sample.length;
  const all = [...kept, ...sample].sort((a, b) =>
    comparePlayerIds(rowPlayerId(a) ?? "", rowPlayerId(b) ?? ""),
  );
  stats.kept = all.length;
  return { rows: all, stats };
}

/** Player ids present in a list of rows. */
export function rowPlayerIds(rows: readonly unknown[]): Set<string> {
  const ids = new Set<string>();
  for (const r of rows) {
    const id = rowPlayerId(r);
    if (id !== null) ids.add(id);
  }
  return ids;
}
