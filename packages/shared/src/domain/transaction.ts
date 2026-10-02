import { z } from "zod";

export const TRANSACTION_TYPES = ["waiver", "free_agent", "trade", "commissioner"] as const;
/** Known types are listed above, but Sleeper may add others, so the schema accepts any non-empty string. */
export const TransactionTypeSchema = z.string().min(1);
export type TransactionType = string;

/**
 * A traded draft pick. Passthrough record: Sleeper's pick fields (season, round, owner ids) are
 * only documented from empty arrays so far (trades not yet observed), so we do not pin them.
 */
export const TransactionDraftPickSchema = z.record(z.string(), z.unknown());
export type TransactionDraftPick = z.infer<typeof TransactionDraftPickSchema>;

/** A FAAB transfer between rosters (ids are roster ids). */
export const WaiverBudgetTransferSchema = z.strictObject({
  sender: z.number().int(),
  receiver: z.number().int(),
  amount: z.number(),
});
export type WaiverBudgetTransfer = z.infer<typeof WaiverBudgetTransferSchema>;

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
  /** Traded draft picks; empty unless a trade. */
  draftPicks: z.array(TransactionDraftPickSchema).default([]),
  /** FAAB traded between rosters; empty unless a trade involves budget. */
  waiverBudget: z.array(WaiverBudgetTransferSchema).default([]),
  /** Roster ids that consented (trades); null when absent. */
  consenterIds: z.array(z.number().int()).nullable(),
});
export type Transaction = z.infer<typeof TransactionSchema>;
