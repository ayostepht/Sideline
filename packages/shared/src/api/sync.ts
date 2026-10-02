import { z } from "zod";
import { SyncJobNameSchema, SyncRequestSchema, SyncRunSchema } from "../sync.js";

/** Per-job status. `lastSuccessAt` is ISO 8601 or null; `stale` is true when past the job's cadence. */
export const SyncJobStatusSchema = z.strictObject({
  job: SyncJobNameSchema,
  lastRun: SyncRunSchema.nullable(),
  lastSuccessAt: z.string().nullable(),
  stale: z.boolean(),
});
export type SyncJobStatus = z.infer<typeof SyncJobStatusSchema>;

export const SyncStatusResponseSchema = z.strictObject({
  jobs: z.array(SyncJobStatusSchema),
  pending: z.array(SyncRequestSchema),
});
export type SyncStatusResponse = z.infer<typeof SyncStatusResponseSchema>;

export const SyncRunRequestBodySchema = z.strictObject({
  job: z.union([SyncJobNameSchema, z.literal("all")]).default("all"),
});
export type SyncRunRequestBody = z.infer<typeof SyncRunRequestBodySchema>;

/** `deduplicated` is true when an identical pending request already existed and was returned. */
export const SyncRunResponseSchema = z.strictObject({
  request: SyncRequestSchema,
  deduplicated: z.boolean(),
});
export type SyncRunResponse = z.infer<typeof SyncRunResponseSchema>;
