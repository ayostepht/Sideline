import {
  OnboardingStartRequestSchema,
  OnboardingStatusSchema,
  PlayerSearchRequestSchema,
  PlayerSearchResultSchema,
  SelectLeagueRequestSchema,
  SleeperUsernameSchema,
  AppSettingsSchema,
} from "@sideline/shared";
import { z } from "zod";
import { errorResult, type ApiResult } from "./http";
import { getSettings } from "./identity";
import { searchPlayers } from "./league-views";
import { getOnboardingStatus, selectLeague, startOnboarding } from "./onboarding";
import { withMigratedDb } from "./sync";

type Env = Record<string, string | undefined>;

/** PATCH /api/settings body. Username and league are changed one at a time. */
export const SettingsPatchSchema = z
  .strictObject({
    username: SleeperUsernameSchema.optional(),
    leagueId: z.string().min(1).max(64).optional(),
  })
  .refine((v) => (v.username === undefined) !== (v.leagueId === undefined), {
    message: "Send exactly one of username or leagueId",
  });

/** Names the failing fields only; never echoes submitted values. */
function invalid(error: z.ZodError): ApiResult {
  const fields = [
    ...new Set(
      error.issues.map((i) => (i.path.length > 0 ? i.path.map(String).join(".") : "body")),
    ),
  ];
  return errorResult(400, "invalid_request", `Invalid request: ${fields.join(", ")}.`);
}

function parseBody(raw: string): { ok: true; json: unknown } | { ok: false; result: ApiResult } {
  if (raw.trim() === "") return { ok: true, json: {} };
  try {
    return { ok: true, json: JSON.parse(raw) };
  } catch {
    return { ok: false, result: errorResult(400, "invalid_body", "Body must be valid JSON.") };
  }
}

export function handleStartOnboarding(rawBody: string, now: Date = new Date()): ApiResult {
  const body = parseBody(rawBody);
  if (!body.ok) return body.result;
  const parsed = OnboardingStartRequestSchema.safeParse(body.json);
  if (!parsed.success) return invalid(parsed.error);
  return withMigratedDb((h) => {
    const r = startOnboarding(h, parsed.data.username, now);
    if (r.kind === "invalid_username")
      return errorResult(400, "invalid_request", "Invalid username.");
    if (r.kind === "worker_offline") {
      return { status: 200, body: OnboardingStatusSchema.parse(r.status) };
    }
    return { status: r.created ? 202 : 200, body: OnboardingStatusSchema.parse(r.status) };
  });
}

export function handleOnboardingStatus(now: Date = new Date()): ApiResult {
  return withMigratedDb((h) => ({
    status: 200,
    body: OnboardingStatusSchema.parse(getOnboardingStatus(h, now)),
  }));
}

export function handleSelectLeague(rawBody: string, now: Date = new Date()): ApiResult {
  const body = parseBody(rawBody);
  if (!body.ok) return body.result;
  const parsed = SelectLeagueRequestSchema.safeParse(body.json);
  if (!parsed.success) return invalid(parsed.error);
  return withMigratedDb((h) => {
    const r = selectLeague(h, parsed.data.leagueId, now);
    if (r.kind === "invalid_league") {
      return errorResult(400, "invalid_league", "That league is not one of your leagues.");
    }
    return { status: 200, body: { activeLeagueId: r.activeLeagueId, sync: r.sync } };
  });
}

export function handleSearch(leagueId: string, params: URLSearchParams): ApiResult {
  const idOk = z.string().min(1).max(64).safeParse(leagueId);
  if (!idOk.success) return errorResult(404, "not_found", "League not found.");
  const raw: Record<string, string> = {};
  const q = params.get("q");
  const limit = params.get("limit");
  if (q !== null) raw["q"] = q;
  if (limit !== null) raw["limit"] = limit;
  const parsed = PlayerSearchRequestSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  return withMigratedDb((h) => {
    const r = searchPlayers(h, idOk.data, parsed.data.q, parsed.data.limit);
    if (!r.ok) return errorResult(404, "not_found", "League not found.");
    return { status: 200, body: z.array(PlayerSearchResultSchema).parse(r.data) };
  });
}

export function handleGetSettings(env: Env = process.env): ApiResult {
  return withMigratedDb((h) => ({
    status: 200,
    body: AppSettingsSchema.parse(getSettings(h, env)),
  }));
}

export function handlePatchSettings(
  rawBody: string,
  now: Date = new Date(),
  env: Env = process.env,
): ApiResult {
  const body = parseBody(rawBody);
  if (!body.ok) return body.result;
  const parsed = SettingsPatchSchema.safeParse(body.json);
  if (!parsed.success) return invalid(parsed.error);
  const { username, leagueId } = parsed.data;
  return withMigratedDb((h) => {
    if (username !== undefined) {
      const r = startOnboarding(h, username, now);
      if (r.kind === "invalid_username") {
        return errorResult(400, "invalid_request", "Invalid username.");
      }
      return {
        status: 200,
        body: { settings: getSettings(h, env), onboarding: OnboardingStatusSchema.parse(r.status) },
      };
    }
    const r = selectLeague(h, leagueId ?? "", now);
    if (r.kind === "invalid_league") {
      return errorResult(400, "invalid_league", "That league is not one of your leagues.");
    }
    return { status: 200, body: { settings: getSettings(h, env), onboarding: null, sync: r.sync } };
  });
}
