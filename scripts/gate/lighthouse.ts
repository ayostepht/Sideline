import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const ScoreSchema = z.object({ score: z.number().nullable() });
const LhrSchema = z.object({
  finalUrl: z.string().optional(),
  requestedUrl: z.string().optional(),
  categories: z.record(z.string(), ScoreSchema),
});

/** PLAN.md 6.6 minimums (as fractions, matching lighthouserc.json). */
export const LIGHTHOUSE_BUDGETS: Record<string, number> = {
  performance: 0.85,
  accessibility: 0.95,
  "best-practices": 0.95,
};

export function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const hi = sorted[mid];
  const lo = sorted[mid - 1];
  if (hi === undefined) return undefined;
  return sorted.length % 2 === 1 || lo === undefined ? hi : (lo + hi) / 2;
}

/** Median category scores (0 to 100) per URL across all runs found. */
export function summarizeLhrs(lhrs: readonly unknown[]): Record<string, Record<string, number>> {
  const byUrl = new Map<string, Map<string, number[]>>();
  for (const lhr of lhrs) {
    const parsed = LhrSchema.safeParse(lhr);
    if (!parsed.success) continue;
    const url = parsed.data.finalUrl ?? parsed.data.requestedUrl ?? "unknown";
    const cats = byUrl.get(url) ?? new Map<string, number[]>();
    for (const [name, cat] of Object.entries(parsed.data.categories)) {
      if (cat.score === null) continue;
      const list = cats.get(name) ?? [];
      list.push(cat.score);
      cats.set(name, list);
    }
    byUrl.set(url, cats);
  }
  const out: Record<string, Record<string, number>> = {};
  for (const [url, cats] of byUrl) {
    const scores: Record<string, number> = {};
    for (const [name, list] of cats) {
      const m = median(list);
      if (m !== undefined) scores[name] = Math.round(m * 100);
    }
    out[url] = scores;
  }
  return out;
}

export function readLhrs(dir: string): unknown[] {
  let names: string[];
  try {
    names = readdirSync(dir).filter((n) => /^lhr-.*\.json$/.test(n));
  } catch {
    return [];
  }
  return names.map((n) => JSON.parse(readFileSync(path.join(dir, n), "utf8")) as unknown);
}
