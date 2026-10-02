import { z } from "zod";

/** `updatedAt` is ISO 8601 of the last successful sync, null when never synced. */
export const FreshnessSchema = z.strictObject({
  updatedAt: z.string().nullable(),
  stale: z.boolean(),
});
export type Freshness = z.infer<typeof FreshnessSchema>;

/**
 * PLAN 3.4: stale when age > 2x cadence (exactly 2x is not stale). Null cadence (one-time jobs)
 * is never stale. Never synced (null lastSuccess) is stale. `nowMs` is passed in.
 */
export function computeFreshness(
  lastSuccessIso: string | null,
  cadenceMs: number | null,
  nowMs: number,
): Freshness {
  if (lastSuccessIso === null) return { updatedAt: null, stale: cadenceMs !== null };
  if (cadenceMs === null) return { updatedAt: lastSuccessIso, stale: false };
  const t = Date.parse(lastSuccessIso);
  if (Number.isNaN(t)) return { updatedAt: lastSuccessIso, stale: true };
  return { updatedAt: lastSuccessIso, stale: nowMs - t > 2 * cadenceMs };
}
