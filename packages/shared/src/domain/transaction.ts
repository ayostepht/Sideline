import { z } from "zod";

export const TRANSACTION_TYPES = ["waiver", "free_agent", "trade", "commissioner"] as const;
export const TransactionTypeSchema = z.enum(TRANSACTION_TYPES);
export type TransactionType = z.infer<typeof TransactionTypeSchema>;

/** Statuses seen so far. Sleeper may add others, so the schema accepts any string. */
export const KNOWN_TRANSACTION_STATUSES = ["complete", "failed", "pending"] as const;
export const TransactionStatusSchema = z.string();
export type TransactionStatus = string;

/**
 * A league transaction. `week` is the Sleeper `leg`. `adds`/`drops` map player id to the roster id
 * involved; null when none. `waiverBid` is null unless FAAB. `createdAt` and `statusUpdatedAt` are
 * ms epoch. Failed claims are kept (status "failed").
 */
export const TransactionSchema = z.strictObject({
  leagueId: z.string(),
  transactionId: z.string(),
  week: z.number().int(),
  type: TransactionTypeSchema,
  status: TransactionStatusSchema,
  adds: z.record(z.string(), z.number().int()).nullable(),
  drops: z.record(z.string(), z.number().int()).nullable(),
  rosterIds: z.array(z.number().int()),
  waiverBid: z.number().nullable(),
  /** User id of the creator; null when unknown. */
  creator: z.string().nullable(),
  /** ms epoch. */
  createdAt: z.number().int(),
  /** ms epoch; null when never updated. */
  statusUpdatedAt: z.number().int().nullable(),
});
export type Transaction = z.infer<typeof TransactionSchema>;
