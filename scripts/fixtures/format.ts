/**
 * Stable JSON output for fixtures: sorted keys, 2-space indent, trailing newline.
 * Big collections (players, projections, stats) put one entry per line so diffs stay readable
 * without a 3x size blow-up from nested indentation.
 */

function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return (value as unknown[]).map(sortKeysDeep);
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort(compareKeys)) {
      out[k] = sortKeysDeep((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

/** Pretty JSON, 2-space indent, sorted keys. */
export function stringifyStable(value: unknown): string {
  return `${JSON.stringify(sortKeysDeep(value), null, 2)}\n`;
}

/** Array with one compact row per line. */
export function stringifyRows(rows: readonly unknown[]): string {
  if (rows.length === 0) return "[]\n";
  const lines = rows.map((r) => `  ${JSON.stringify(sortKeysDeep(r))}`);
  return `[\n${lines.join(",\n")}\n]\n`;
}

/** Object with one compact entry per line (keys in the order given). */
export function stringifyKeyed(obj: Readonly<Record<string, unknown>>): string {
  const keys = Object.keys(obj);
  if (keys.length === 0) return "{}\n";
  const lines = keys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(sortKeysDeep(obj[k]))}`);
  return `{\n${lines.join(",\n")}\n}\n`;
}
