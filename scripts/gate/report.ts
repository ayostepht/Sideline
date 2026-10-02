import { z } from "zod";
import type { CheckStatus } from "./status.js";

export interface CheckResult {
  id: string;
  name: string;
  status: CheckStatus;
  reason?: string;
  durationMs: number;
  metrics?: Record<string, unknown>;
  logFile: string;
}

export interface GateSummary {
  pass: number;
  fail: number;
  skipped: number;
}

export interface GateReport {
  startedAt: string;
  finishedAt: string;
  gitCommit: string;
  gitBranch: string;
  dirty: boolean;
  /** True when --only limited the run, so the report does not cover every check. */
  partial: boolean;
  /** Values later runs compare against. Only updated by a run whose U1 passed. */
  baselines: { eslintWarnings?: number };
  checks: CheckResult[];
  summary: GateSummary;
}

export function summarize(checks: readonly CheckResult[]): GateSummary {
  const summary: GateSummary = { pass: 0, fail: 0, skipped: 0 };
  for (const check of checks) {
    if (check.status === "PASS") summary.pass += 1;
    else if (check.status === "FAIL") summary.fail += 1;
    else summary.skipped += 1;
  }
  return summary;
}

/** Skipped ids not covered by an allow-list entry (exact id match, case-insensitive). */
export function disallowedSkips(
  checks: readonly CheckResult[],
  allowSkip: readonly string[],
): string[] {
  const allowed = new Set(allowSkip.map((s) => s.toLowerCase()));
  return checks
    .filter((c) => c.status === "SKIPPED" && !allowed.has(c.id.toLowerCase()))
    .map((c) => c.id);
}

/**
 * The gate passes when nothing failed. Skipped checks are always listed; under strict mode a
 * skipped check that is not in the allow-list also fails the gate.
 */
export function gateExitCode(
  summary: GateSummary,
  strict?: { checks: readonly CheckResult[]; allowSkip: readonly string[] },
): 0 | 1 {
  if (summary.fail > 0) return 1;
  if (strict !== undefined && disallowedSkips(strict.checks, strict.allowSkip).length > 0) return 1;
  return 0;
}

/** What we read back from the previous docs/gates/latest.json (validated, all fields lenient). */
const PreviousReportSchema = z.object({
  baselines: z.object({ eslintWarnings: z.number().optional() }).optional(),
  checks: z
    .array(
      z.object({
        id: z.string(),
        metrics: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .optional(),
});

export interface PreviousReport {
  eslintWarnings?: number;
}

/** Parses the text of a previous latest.json; returns undefined values when it is unusable. */
export function parsePreviousReport(text: string): PreviousReport {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {};
  }
  const parsed = PreviousReportSchema.safeParse(raw);
  if (!parsed.success) return {};
  const fromBaseline = parsed.data.baselines?.eslintWarnings;
  if (fromBaseline !== undefined) return { eslintWarnings: fromBaseline };
  const u1 = parsed.data.checks?.find((c) => c.id === "U1");
  const metric = u1?.metrics?.["eslintWarnings"];
  return typeof metric === "number" ? { eslintWarnings: metric } : {};
}
