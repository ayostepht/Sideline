import { z } from "zod";

const EslintJsonSchema = z.array(
  z.object({ warningCount: z.number(), errorCount: z.number() }).passthrough(),
);

export interface EslintCounts {
  warnings: number;
  errors: number;
}

/** Sums warning and error counts from `eslint --format json` output. */
export function countEslintMessages(json: unknown): EslintCounts | undefined {
  const parsed = EslintJsonSchema.safeParse(json);
  if (!parsed.success) return undefined;
  let warnings = 0;
  let errors = 0;
  for (const file of parsed.data) {
    warnings += file.warningCount;
    errors += file.errorCount;
  }
  return { warnings, errors };
}

export interface WarningComparison {
  ok: boolean;
  reason?: string;
}

/** U1: lint warnings must not increase versus the previous gate. No baseline means OK. */
export function compareWarnings(previous: number | undefined, current: number): WarningComparison {
  if (previous === undefined || current <= previous) return { ok: true };
  return {
    ok: false,
    reason: `eslint warnings increased from ${previous} to ${current}`,
  };
}
