import { z } from "zod";

/**
 * Structured explanation attached to analytics outputs (PLAN 5). `code` is stable and machine
 * readable, `label` is short plain-language copy, `impact` is a signed effect in points when known.
 */
export const ReasonSchema = z.strictObject({
  code: z.string(),
  label: z.string(),
  value: z.union([z.number(), z.string()]).optional(),
  impact: z.number().optional(),
});
export type Reason = z.infer<typeof ReasonSchema>;
