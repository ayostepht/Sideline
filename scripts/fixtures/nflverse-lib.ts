/**
 * Pure helpers for the nflverse fixture recorder (no I/O, no clock). See docs/sleeper-api-notes.md
 * section 14 for why each rule exists.
 */

export type CsvRow = Record<string, string>;

export interface CsvTable {
  header: string[];
  rows: CsvRow[];
}

/** Minimal RFC 4180 parser (quotes, doubled quotes, CRLF or LF). Blank lines are skipped. */
export function parseCsv(text: string): CsvTable {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;
  const endField = (): void => {
    record.push(field);
    field = "";
  };
  const endRecord = (): void => {
    endField();
    if (!(record.length === 1 && record[0] === "")) records.push(record);
    record = [];
  };
  while (i < text.length) {
    const c = text[i] as string;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") endField();
    else if (c === "\n") endRecord();
    else if (c === "\r") {
      if (text[i + 1] === "\n") i += 1;
      endRecord();
    } else field += c;
    i += 1;
  }
  if (field !== "" || record.length > 0) endRecord();
  const [header = [], ...body] = records;
  const rows = body.map((cells) => {
    const row: CsvRow = {};
    header.forEach((h, idx) => {
      row[h] = cells[idx] ?? "";
    });
    return row;
  });
  return { header, rows };
}

function quote(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Serializes with LF line endings and a trailing newline; unknown columns become empty. */
export function toCsv(columns: readonly string[], rows: readonly CsvRow[]): string {
  const lines = [columns.map(quote).join(",")];
  for (const row of rows) lines.push(columns.map((c) => quote(row[c] ?? "")).join(","));
  return `${lines.join("\n")}\n`;
}

/** Keeps only `columns` (in that order). Throws if a wanted column is missing from the header. */
export function trimColumns(table: CsvTable, columns: readonly string[]): CsvTable {
  const missing = columns.filter((c) => !table.header.includes(c));
  if (missing.length > 0) throw new Error(`missing columns: ${missing.join(", ")}`);
  return {
    header: [...columns],
    rows: table.rows.map((row) => {
      const out: CsvRow = {};
      for (const c of columns) out[c] = row[c] ?? "";
      return out;
    }),
  };
}

/** Stable sort by the given columns; numeric when both values are numbers, else string compare. */
export function sortRows(rows: readonly CsvRow[], keys: readonly string[]): CsvRow[] {
  return [...rows].sort((a, b) => {
    for (const k of keys) {
      const av = a[k] ?? "";
      const bv = b[k] ?? "";
      if (av === bv) continue;
      const an = Number(av);
      const bn = Number(bv);
      if (av !== "" && bv !== "" && Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
      return av < bv ? -1 : 1;
    }
    return 0;
  });
}

/** Lowercase, drop punctuation and generational suffixes, collapse spaces. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/[^a-z]+/g, " ")
    .trim();
}

/** Sleeper team code to nflverse team code. Only the Rams differ (verified 2026-10-02). */
export const SLEEPER_TO_NFLVERSE_TEAM: Readonly<Record<string, string>> = { LAR: "LA" };

export function toNflverseTeam(sleeperTeam: string): string {
  return SLEEPER_TO_NFLVERSE_TEAM[sleeperTeam] ?? sleeperTeam;
}

export interface SleeperPlayerLite {
  full_name?: string | null;
  team?: string | null;
  gsis_id?: string | null;
}

export interface PlayerMatcher {
  gsisIds: ReadonlySet<string>;
  nameTeamKeys: ReadonlySet<string>;
}

export function nameTeamKey(name: string, nflverseTeam: string): string {
  return `${normalizeName(name)}|${nflverseTeam}`;
}

/** Builds the join sets from the Sleeper player fixture. gsis ids are trimmed (Sleeper pads some). */
export function buildMatcher(players: readonly SleeperPlayerLite[]): PlayerMatcher {
  const gsisIds = new Set<string>();
  const nameTeamKeys = new Set<string>();
  for (const p of players) {
    const gsis = p.gsis_id?.trim();
    if (gsis) gsisIds.add(gsis);
    if (p.full_name && p.team) nameTeamKeys.add(nameTeamKey(p.full_name, toNflverseTeam(p.team)));
  }
  return { gsisIds, nameTeamKeys };
}

export interface KeepOptions {
  matcher: PlayerMatcher;
  /** nflverse team codes whose rows are kept in full. */
  keepTeams: ReadonlySet<string>;
  /** pfr ids that map to a kept gsis id (snap counts only). */
  keepPfrIds?: ReadonlySet<string>;
}

export function keepStatsRow(row: CsvRow, opts: KeepOptions): boolean {
  if (opts.keepTeams.has(row["team"] ?? "")) return true;
  const gsis = (row["player_id"] ?? "").trim();
  if (gsis !== "" && opts.matcher.gsisIds.has(gsis)) return true;
  return opts.matcher.nameTeamKeys.has(
    nameTeamKey(row["player_display_name"] ?? "", row["team"] ?? ""),
  );
}

export function keepSnapRow(row: CsvRow, opts: KeepOptions): boolean {
  if (opts.keepTeams.has(row["team"] ?? "")) return true;
  if (opts.keepPfrIds?.has(row["pfr_player_id"] ?? "")) return true;
  return opts.matcher.nameTeamKeys.has(nameTeamKey(row["player"] ?? "", row["team"] ?? ""));
}

/** Weekly rows for `season`, regular season, weeks 1..throughWeek. */
export function inWindow(row: CsvRow, season: number, throughWeek: number): boolean {
  const week = Number(row["week"]);
  return Number(row["season"]) === season && week >= 1 && week <= throughWeek;
}

/**
 * Kickoff instant for a schedule row. `gameday` (YYYY-MM-DD) and `gametime` (HH:MM) are America/New_York
 * wall-clock. Returns null when gametime is missing (caller marks the kickoff approximate).
 */
export function kickoffUtc(gameday: string, gametime: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(gameday);
  const t = /^(\d{1,2}):(\d{2})$/.exec(gametime);
  if (!d || !t) return null;
  const [y, mo, da] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const [h, mi] = [Number(t[1]), Number(t[2])];
  // Two-pass offset resolution: guess the wall time as UTC, ask what ET looks like then, correct.
  const wallAsUtc = Date.UTC(y, mo - 1, da, h, mi);
  let utc = wallAsUtc - etOffsetMinutes(wallAsUtc) * 60_000;
  utc = wallAsUtc - etOffsetMinutes(utc) * 60_000;
  return new Date(utc).toISOString();
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

/** Offset of America/New_York from UTC in minutes at the given instant (negative: -240 EDT, -300 EST). */
function etOffsetMinutes(utcMs: number): number {
  const parts: Record<string, number> = {};
  for (const p of etFormatter.formatToParts(new Date(utcMs))) parts[p.type] = Number(p.value);
  const asUtc = Date.UTC(
    parts["year"] ?? 0,
    (parts["month"] ?? 1) - 1,
    parts["day"] ?? 1,
    parts["hour"] ?? 0,
    parts["minute"] ?? 0,
  );
  return Math.round((asUtc - Math.floor(utcMs / 60_000) * 60_000) / 60_000);
}

/**
 * Implied team totals from nflverse lines. Positive `spread_line` means the HOME team is favored
 * (verified against moneylines, notes section 14d).
 */
export function impliedTotals(
  spreadLine: number,
  totalLine: number,
): { home: number; away: number } {
  return { home: totalLine / 2 + spreadLine / 2, away: totalLine / 2 - spreadLine / 2 };
}
