import type { RawStatRow } from "../schemas/raw.js";
import { RawStatRowSchema } from "../schemas/raw.js";

/** The six positions we request and keep. FB, P, CB, DB and others leak through the API filter. */
export const FANTASY_POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"] as const;
const ALLOWED: ReadonlySet<string> = new Set(FANTASY_POSITIONS);

export type RowKind = "projections" | "stats";

export interface DroppedCounts {
  /** Rows with no game data (see the per-kind rule). */
  placeholder: number;
  /** Rows whose position is not one of the six, or is missing. */
  position: number;
  /** Rows that failed row-level validation. */
  other: number;
}

export type RowsResult<R> =
  | { status: "ok"; rows: R[]; dropped: DroppedCounts; notModified: boolean }
  | {
      status: "unavailable";
      reason: "empty" | "no_real_rows";
      dropped: DroppedCounts;
      notModified: boolean;
    };

/**
 * Real-row rules (docs/sleeper-api-notes.md 4.5):
 * - projections: `stats.gp` present AND `opponent` not null (placeholders hold only ADP).
 * - stats: `opponent` not null. `gp` is NOT required: players on a roster who were active but did not
 *   play (stats hold only `gms_active` and rank fields) carry no `gp`.
 * Neither rule looks at point totals, so a bye-week or low-usage player is never dropped for
 * having small stats. Byes belong to the schedule (ADR-006 item 7).
 */
export function isRealRow(kind: RowKind, row: RawStatRow): boolean {
  if (row.opponent == null) return false;
  return kind === "projections" ? row.stats["gp"] !== undefined : true;
}

/** Filters raw rows (any shape) to real rows of an allowed position, counting drops by reason. */
export function filterRows(
  kind: RowKind,
  rawRows: readonly unknown[],
  notModified: boolean,
): RowsResult<RawStatRow> {
  const dropped: DroppedCounts = { placeholder: 0, position: 0, other: 0 };
  const rows: RawStatRow[] = [];
  for (const raw of rawRows) {
    const parsed = RawStatRowSchema.safeParse(raw);
    if (!parsed.success) {
      dropped.other += 1;
      continue;
    }
    const row = parsed.data;
    const position = row.player?.position;
    if (position == null || !ALLOWED.has(position)) dropped.position += 1;
    else if (!isRealRow(kind, row)) dropped.placeholder += 1;
    else rows.push(row);
  }
  if (rawRows.length === 0) return { status: "unavailable", reason: "empty", dropped, notModified };
  if (rows.length === 0) {
    return { status: "unavailable", reason: "no_real_rows", dropped, notModified };
  }
  return { status: "ok", rows, dropped, notModified };
}
