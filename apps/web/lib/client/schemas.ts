import { OnboardingStatusSchema } from "@sideline/shared/src/api/onboarding";
import { PlayersListResponseSchema } from "@sideline/shared/src/api/players";
import { SyncRunResponseSchema, SyncStatusResponseSchema } from "@sideline/shared/src/api/sync";
import { TradeEvaluateResponseSchema } from "@sideline/shared/src/api/trades";
import { WaiverResponseSchema } from "@sideline/shared/src/api/waiver";
import { z } from "zod";

// Loaded on demand by apiJson so zod stays out of the first-load bundle.
export {
  OnboardingStatusSchema,
  PlayersListResponseSchema,
  SyncRunResponseSchema,
  SyncStatusResponseSchema,
  TradeEvaluateResponseSchema,
  WaiverResponseSchema,
};

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

/** T6.1c: shape of both POST /api/login and DELETE /api/login success bodies. */
export const LoginResponseSchema = z.object({ ok: z.literal(true) });
