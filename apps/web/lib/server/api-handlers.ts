import {
  OnboardingStartRequestSchema,
  OnboardingStatusSchema,
  PlayerSearchRequestSchema,
  PlayerSearchResultSchema,
  LineupRequestSchema,
  LineupResponseSchema,
  MatchupRequestSchema,
  MatchupResponseSchema,
  PlayerDetailResponseSchema,
  PlayersListRequestSchema,
  PlayersListResponseSchema,
  SelectLeagueRequestSchema,
  SleeperUsernameSchema,
  AppSettingsSchema,
  WaiverRequestSchema,
  WaiverResponseSchema,
} from "@sideline/shared";
import { z } from "zod";
import { errorResult, type ApiResult } from "./http";
import { getSettings } from "./identity";
import { searchPlayers } from "./league-views";
import { getLineup } from "./lineup";
import { getMatchup } from "./matchup";
import { getOnboardingStatus, selectLeague, startOnboarding } from "./onboarding";
import { getPlayerDetail, getPlayersList } from "./players";
import { withMigratedDb } from "./sync";
import { getWaivers } from "./waivers";

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

/**
 * Response: `{ activeLeagueId, sync, syncSince }`. `syncSince` is the server-clock `requested_at`
 * (ISO) of the `all` sync request this selection queued or reused, or null when `sync` is
 * "rate_limited" (same league, no new sync is coming; treat it as already synced). Any job run
 * that finishes at or after `syncSince` belongs to this sync. `PATCH /api/settings` with a
 * `leagueId` returns the same `sync` and `syncSince` fields next to `settings` and `onboarding`.
 */
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
    return {
      status: 200,
      body: { activeLeagueId: r.activeLeagueId, sync: r.sync, syncSince: r.syncSince },
    };
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

export function handleLineup(
  leagueId: string,
  params: URLSearchParams,
  now: Date = new Date(),
): ApiResult {
  const idOk = z.string().min(1).max(64).safeParse(leagueId);
  if (!idOk.success) return errorResult(404, "not_found", "League not found.");
  const raw: Record<string, string> = {};
  const week = params.get("week");
  const mode = params.get("mode");
  const roster = params.get("roster");
  if (week !== null) raw["week"] = week;
  if (mode !== null) raw["mode"] = mode;
  if (roster !== null) raw["roster"] = roster;
  const parsed = LineupRequestSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  return withMigratedDb((h) => {
    const r = getLineup(
      h,
      idOk.data,
      {
        ...(parsed.data.week !== undefined ? { week: parsed.data.week } : {}),
        mode: parsed.data.mode,
        ...(parsed.data.roster !== undefined ? { rosterId: parsed.data.roster } : {}),
      },
      now,
    );
    if (!r.ok) {
      if (r.reason === "no_team") {
        return errorResult(404, "no_team", "No roster found for the stored Sleeper user.");
      }
      return errorResult(404, "not_found", "League, week, or roster not found.");
    }
    return { status: 200, body: LineupResponseSchema.parse(r.data) };
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
    return {
      status: 200,
      body: {
        settings: getSettings(h, env),
        onboarding: null,
        sync: r.sync,
        syncSince: r.syncSince,
      },
    };
  });
}

/** T4.5b: GET /api/l/[leagueId]/waivers (candidate views, Waiver Score, priority advisor). */
export function handleWaivers(
  leagueId: string,
  params: URLSearchParams,
  now: Date = new Date(),
): ApiResult {
  const idOk = z.string().min(1).max(64).safeParse(leagueId);
  if (!idOk.success) return errorResult(404, "not_found", "League not found.");
  const raw: Record<string, string> = {};
  const week = params.get("week");
  const roster = params.get("roster");
  const positions = params.get("positions");
  if (week !== null) raw["week"] = week;
  if (roster !== null) raw["roster"] = roster;
  if (positions !== null) raw["positions"] = positions;
  const parsed = WaiverRequestSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  return withMigratedDb((h) => {
    const r = getWaivers(
      h,
      idOk.data,
      {
        ...(parsed.data.week !== undefined ? { week: parsed.data.week } : {}),
        ...(parsed.data.roster !== undefined ? { rosterId: parsed.data.roster } : {}),
        ...(parsed.data.positions !== undefined ? { positions: parsed.data.positions } : {}),
      },
      now,
    );
    if (!r.ok) {
      if (r.reason === "no_team") {
        return errorResult(404, "no_team", "No roster found for the stored Sleeper user.");
      }
      return errorResult(404, "not_found", "League, week, or roster not found.");
    }
    return { status: 200, body: WaiverResponseSchema.parse(r.data) };
  });
}

/** T5.4b: GET /api/l/[leagueId]/matchup (this week's simulated head-to-head win probability,
 * score distribution, and swing players). */
export function handleMatchup(
  leagueId: string,
  params: URLSearchParams,
  now: Date = new Date(),
): ApiResult {
  const idOk = z.string().min(1).max(64).safeParse(leagueId);
  if (!idOk.success) return errorResult(404, "not_found", "League not found.");
  const raw: Record<string, string> = {};
  const week = params.get("week");
  const roster = params.get("roster");
  if (week !== null) raw["week"] = week;
  if (roster !== null) raw["roster"] = roster;
  const parsed = MatchupRequestSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  return withMigratedDb((h) => {
    const r = getMatchup(
      h,
      idOk.data,
      {
        ...(parsed.data.week !== undefined ? { week: parsed.data.week } : {}),
        ...(parsed.data.roster !== undefined ? { rosterId: parsed.data.roster } : {}),
      },
      now,
    );
    if (!r.ok) {
      if (r.reason === "no_team") {
        return errorResult(404, "no_team", "No roster found for the stored Sleeper user.");
      }
      if (r.reason === "no_opponent") {
        return errorResult(
          404,
          "no_opponent",
          "No opponent is scheduled for this roster this week.",
        );
      }
      return errorResult(404, "not_found", "League, week, or roster not found.");
    }
    return { status: 200, body: MatchupResponseSchema.parse(r.data) };
  });
}

/** T4.5c: GET /api/l/[leagueId]/players (paginated, filterable players list). */
export function handlePlayersList(
  leagueId: string,
  params: URLSearchParams,
  now: Date = new Date(),
): ApiResult {
  const idOk = z.string().min(1).max(64).safeParse(leagueId);
  if (!idOk.success) return errorResult(404, "not_found", "League not found.");
  const raw: Record<string, string> = {};
  const page = params.get("page");
  const pageSize = params.get("pageSize");
  const position = params.get("position");
  const q = params.get("q");
  if (page !== null) raw["page"] = page;
  if (pageSize !== null) raw["pageSize"] = pageSize;
  if (position !== null) raw["position"] = position;
  if (q !== null) raw["q"] = q;
  const parsed = PlayersListRequestSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  return withMigratedDb((h) => {
    const r = getPlayersList(h, idOk.data, parsed.data, now);
    if (!r.ok) return errorResult(404, "not_found", "League not found.");
    return { status: 200, body: PlayersListResponseSchema.parse(r.data) };
  });
}

/** T4.5c: GET /api/l/[leagueId]/players/[playerId] (player detail). */
export function handlePlayerDetail(
  leagueId: string,
  playerId: string,
  now: Date = new Date(),
): ApiResult {
  const idOk = z.string().min(1).max(64).safeParse(leagueId);
  if (!idOk.success) return errorResult(404, "not_found", "League not found.");
  const playerIdOk = z.string().min(1).max(64).safeParse(playerId);
  if (!playerIdOk.success) return errorResult(404, "not_found", "Player not found.");
  return withMigratedDb((h) => {
    const r = getPlayerDetail(h, idOk.data, playerIdOk.data, now);
    if (!r.ok) return errorResult(404, "not_found", "League or player not found.");
    return { status: 200, body: PlayerDetailResponseSchema.parse(r.data) };
  });
}
