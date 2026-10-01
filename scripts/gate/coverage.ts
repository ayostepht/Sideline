import { z } from "zod";

const CountSchema = z.object({ total: z.number(), covered: z.number() });
const EntrySchema = z.object({ lines: CountSchema, branches: CountSchema });
const SummarySchema = z.record(z.string(), EntrySchema);

export interface PackageCoverage {
  linesPct: number | null;
  branchesPct: number | null;
}

function pct(covered: number, total: number): number | null {
  return total === 0 ? null : Math.round((covered / total) * 10_000) / 100;
}

/**
 * Aggregates coverage/coverage-summary.json (Vitest json-summary) per workspace package.
 * Files outside apps/* and packages/* are grouped under "other". A package with no
 * branches reports null for branches instead of a misleading 100.
 */
export function summarizeCoverage(
  summaryJson: unknown,
  root: string,
): Record<string, PackageCoverage> | undefined {
  const parsed = SummarySchema.safeParse(summaryJson);
  if (!parsed.success) return undefined;
  const sums = new Map<string, { lc: number; lt: number; bc: number; bt: number }>();
  const prefix = root.endsWith("/") ? root : `${root}/`;
  for (const [file, entry] of Object.entries(parsed.data)) {
    if (file === "total") continue;
    const rel = file.startsWith(prefix) ? file.slice(prefix.length) : file;
    const match = /^(apps|packages)\/[^/]+/.exec(rel);
    const key = match === null ? "other" : match[0];
    const acc = sums.get(key) ?? { lc: 0, lt: 0, bc: 0, bt: 0 };
    acc.lc += entry.lines.covered;
    acc.lt += entry.lines.total;
    acc.bc += entry.branches.covered;
    acc.bt += entry.branches.total;
    sums.set(key, acc);
  }
  const out: Record<string, PackageCoverage> = {};
  for (const key of [...sums.keys()].sort()) {
    const acc = sums.get(key);
    if (acc === undefined) continue;
    out[key] = { linesPct: pct(acc.lc, acc.lt), branchesPct: pct(acc.bc, acc.bt) };
  }
  return out;
}
