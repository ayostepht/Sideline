import { z } from "zod";
import { SleeperUsernameSchema } from "../sync.js";

export const OnboardingStartRequestSchema = z.strictObject({ username: SleeperUsernameSchema });
export type OnboardingStartRequest = z.infer<typeof OnboardingStartRequestSchema>;

export const LeagueChoiceSchema = z.strictObject({
  leagueId: z.string(),
  name: z.string(),
  season: z.number().int(),
  totalRosters: z.number().int(),
  /** Sleeper league status: pre_draft, drafting, in_season, complete. */
  status: z.string(),
  avatar: z.string().nullable(),
});
export type LeagueChoice = z.infer<typeof LeagueChoiceSchema>;

export const OnboardingPhaseSchema = z.enum([
  "idle",
  "resolving_user",
  "loading_leagues",
  "ready",
  "failed",
  "worker_offline",
]);
export type OnboardingPhase = z.infer<typeof OnboardingPhaseSchema>;

export const OnboardingUserSchema = z.strictObject({
  userId: z.string(),
  username: z.string(),
  displayName: z.string(),
});
export type OnboardingUser = z.infer<typeof OnboardingUserSchema>;

export const OnboardingStatusSchema = z.strictObject({
  phase: OnboardingPhaseSchema,
  error: z.string().optional(),
  user: OnboardingUserSchema.optional(),
  leagues: z.array(LeagueChoiceSchema).optional(),
});
export type OnboardingStatus = z.infer<typeof OnboardingStatusSchema>;

export const SelectLeagueRequestSchema = z.strictObject({ leagueId: z.string().min(1) });
export type SelectLeagueRequest = z.infer<typeof SelectLeagueRequestSchema>;

export const AppSettingsSchema = z.strictObject({
  sleeperUsername: z.string().nullable(),
  sleeperUserId: z.string().nullable(),
  activeLeagueId: z.string().nullable(),
});
export type AppSettingsDto = z.infer<typeof AppSettingsSchema>;
