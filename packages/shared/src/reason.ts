import { z } from "zod";

/**
 * Structured explanation attached to analytics outputs (PLAN 5). `code` is stable and machine
 * readable, `label` is short plain-language copy, `impact` is a signed effect in points when known.
 *
 * `projectedPoints` is optional: it carries the subject player's projected points for the week
 * this reason pertains to (e.g. so the Lineup "why" sheet can show "18.4 proj pts" next to a
 * terse reason code). Not every reason is about a specific player-week's scoring line (e.g. a
 * bye-week flag or a roster-construction note), so this is left unset in those cases rather than
 * forced to 0 or omitted entirely in a way that collides with `value`, which is already used for
 * unrelated numbers (discount multipliers, etc.) on some reason codes. No separate formatted
 * "stat line" string field was added: `label` is being rewritten (T4.8b) to plain, human-readable
 * language per reason code, and formatting a number into display text (units, rounding, "pts"
 * suffix) is presentation concerns that belong to the consuming UI layer (T4.8c), not this shared
 * contract.
 */
export const ReasonSchema = z.strictObject({
  code: z.string(),
  label: z.string(),
  value: z.union([z.number(), z.string()]).optional(),
  impact: z.number().optional(),
  projectedPoints: z.number().optional(),
});
export type Reason = z.infer<typeof ReasonSchema>;
