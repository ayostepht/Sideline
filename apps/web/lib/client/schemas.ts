import { OnboardingStatusSchema } from "@sideline/shared/src/api/onboarding";
import { SyncRunResponseSchema, SyncStatusResponseSchema } from "@sideline/shared/src/api/sync";
import { z } from "zod";

// Loaded on demand by apiJson so zod stays out of the first-load bundle.
export { OnboardingStatusSchema, SyncRunResponseSchema, SyncStatusResponseSchema };

export const SelectLeagueResponseSchema = z.object({
  activeLeagueId: z.string(),
  sync: z.string(),
  /** Server clock ISO time of the sync request this selection queued or reused. */
  syncSince: z.string().nullable().optional(),
});

export const PatchSettingsResponseSchema = z.object({
  onboarding: OnboardingStatusSchema.nullable(),
  sync: z.string().optional(),
  syncSince: z.string().nullable().optional(),
});
