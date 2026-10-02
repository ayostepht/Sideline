import type { SeasonType } from "@sideline/shared";
import { z } from "zod";
import { createSleeperHttp, type SleeperHttp, type SleeperHttpOptions } from "../http/client.js";
import type { SleeperResult } from "../http/client.js";
import type { CallCounter } from "../http/rate-limiter.js";
import {
  RawBracketRowSchema,
  RawDraftPickSchema,
  RawDraftSchema,
  RawLeagueSchema,
  RawLeagueUserSchema,
  RawMatchupSchema,
  RawPlayerSchema,
  RawPlayersEnvelopeSchema,
  RawRosterSchema,
  RawStateSchema,
  RawStatRowsEnvelopeSchema,
  RawTradedPickSchema,
  RawTransactionSchema,
  RawTrendingSchema,
  RawUserSchema,
  type RawPlayer,
  type RawStatRow,
} from "../schemas/raw.js";
import { FANTASY_POSITIONS, filterRows, type RowKind, type RowsResult } from "./real-rows.js";

export interface CallOptions {
  /** Counts this call toward a job's calls_made. */
  counter?: CallCounter;
  /** Aborts the call; no request is sent once aborted. */
  signal?: AbortSignal;
  /** Set false to skip the ETag cache (large bodies). Default true. */
  etag?: boolean;
}

export interface PlayersResult {
  players: RawPlayer[];
  /** Entries that failed validation and were skipped. */
  skipped: number;
}

export interface SleeperClientOptions {
  http: SleeperHttp;
  /** Receives non-fatal problems such as skipped player entries. */
  onWarning?: (message: string, details: Record<string, unknown>) => void;
}

/** `Sideline/<version> (self-hosted)`. Pass the result as `userAgent` when building the HTTP core. */
export function sleeperUserAgent(version: string): string {
  return `Sideline/${version} (self-hosted)`;
}

const positionQuery = FANTASY_POSITIONS.map((p) => `position[]=${p}`).join("&");
const seg = encodeURIComponent;

/**
 * One typed, validated method per Sleeper endpoint. Every call goes through the shared rate
 * limiter inside {@link SleeperHttp}. Plain endpoints return the HTTP result (`data` plus
 * `notModified`); projections and stats return a discriminated {@link RowsResult}.
 */
export class SleeperClient {
  private readonly http: SleeperHttp;
  private readonly warn: NonNullable<SleeperClientOptions["onWarning"]>;

  constructor(options: SleeperClientOptions) {
    this.http = options.http;
    this.warn = options.onWarning ?? (() => undefined);
  }

  getState(o: CallOptions = {}) {
    return this.http.getJson("/state/nfl", RawStateSchema, o);
  }

  /** Resolves to `data: null` when the username does not exist (Sleeper answers 200 null). */
  getUser(username: string, o: CallOptions = {}) {
    return this.http.getJson(`/user/${seg(username)}`, RawUserSchema, o);
  }

  getUserLeagues(userId: string, season: number | string, o: CallOptions = {}) {
    return this.http.getJson(
      `/user/${seg(userId)}/leagues/nfl/${seg(String(season))}`,
      z.array(RawLeagueSchema),
      o,
    );
  }

  getLeague(leagueId: string, o: CallOptions = {}) {
    return this.http.getJson(`/league/${seg(leagueId)}`, RawLeagueSchema, o);
  }

  getLeagueUsers(leagueId: string, o: CallOptions = {}) {
    return this.http.getJson(`/league/${seg(leagueId)}/users`, z.array(RawLeagueUserSchema), o);
  }

  getRosters(leagueId: string, o: CallOptions = {}) {
    return this.http.getJson(`/league/${seg(leagueId)}/rosters`, z.array(RawRosterSchema), o);
  }

  getMatchups(leagueId: string, week: number, o: CallOptions = {}) {
    return this.http.getJson(
      `/league/${seg(leagueId)}/matchups/${week}`,
      z.array(RawMatchupSchema),
      o,
    );
  }

  getTransactions(leagueId: string, week: number, o: CallOptions = {}) {
    return this.http.getJson(
      `/league/${seg(leagueId)}/transactions/${week}`,
      z.array(RawTransactionSchema),
      o,
    );
  }

  getTradedPicks(leagueId: string, o: CallOptions = {}) {
    return this.http.getJson(
      `/league/${seg(leagueId)}/traded_picks`,
      z.array(RawTradedPickSchema),
      o,
    );
  }

  getWinnersBracket(leagueId: string, o: CallOptions = {}) {
    return this.http.getJson(
      `/league/${seg(leagueId)}/winners_bracket`,
      z.array(RawBracketRowSchema),
      o,
    );
  }

  getLosersBracket(leagueId: string, o: CallOptions = {}) {
    return this.http.getJson(
      `/league/${seg(leagueId)}/losers_bracket`,
      z.array(RawBracketRowSchema),
      o,
    );
  }

  getDrafts(leagueId: string, o: CallOptions = {}) {
    return this.http.getJson(`/league/${seg(leagueId)}/drafts`, z.array(RawDraftSchema), o);
  }

  getDraftPicks(draftId: string, o: CallOptions = {}) {
    return this.http.getJson(`/draft/${seg(draftId)}/picks`, z.array(RawDraftPickSchema), o);
  }

  /**
   * `GET /players/nfl` (about 14.7 MB). Never sends If-None-Match and is never cached here.
   * The once-per-day rule is NOT enforced by this client: the worker checks the persisted
   * last-fetch time before calling. Each entry is validated on its own; invalid entries are
   * skipped, counted and reported through `onWarning` so one bad player cannot fail the sync.
   */
  async getPlayers(o: CallOptions = {}): Promise<SleeperResult<PlayersResult>> {
    const res = await this.http.getJson("/players/nfl", RawPlayersEnvelopeSchema, {
      ...o,
      etag: false,
    });
    const players: RawPlayer[] = [];
    let skipped = 0;
    let sample: { key: string; issue: string } | undefined;
    for (const [key, value] of Object.entries(res.data)) {
      const parsed = RawPlayerSchema.safeParse(value);
      if (parsed.success) {
        players.push(parsed.data);
        continue;
      }
      skipped += 1;
      sample ??= {
        key,
        issue: parsed.error.issues
          .slice(0, 2)
          .map((i) => `${i.path.join(".")}: ${i.message}`.slice(0, 120))
          .join("; "),
      };
    }
    if (skipped > 0) this.warn("players: skipped invalid entries", { skipped, sample });
    return { ...res, data: { players, skipped } };
  }

  getTrending(type: "add" | "drop", lookbackHours = 24, limit = 50, o: CallOptions = {}) {
    return this.http.getJson(
      `/players/nfl/trending/${type}?lookback_hours=${lookbackHours}&limit=${limit}`,
      RawTrendingSchema,
      o,
    );
  }

  getProjections(season: number, week: number, seasonType: SeasonType, o: CallOptions = {}) {
    return this.fetchRows("projections", season, week, seasonType, o);
  }

  getStats(season: number, week: number, seasonType: SeasonType, o: CallOptions = {}) {
    return this.fetchRows("stats", season, week, seasonType, o);
  }

  /**
   * Always sends `season_type` (omitting it is a 400) and the six position params, then filters
   * rows. HTTP 200 alone is never success: no real rows means `status: "unavailable"`.
   */
  private async fetchRows(
    kind: RowKind,
    season: number,
    week: number,
    seasonType: SeasonType,
    o: CallOptions,
  ): Promise<RowsResult<RawStatRow>> {
    const path = `/${kind}/nfl/${season}/${week}?season_type=${seg(seasonType)}&${positionQuery}`;
    const res = await this.http.getJson(path, RawStatRowsEnvelopeSchema, { ...o, root: true });
    return filterRows(kind, res.data, res.notModified);
  }
}

export function createSleeperClient(options: SleeperClientOptions): SleeperClient {
  return new SleeperClient(options);
}

/** Builds the HTTP core with the default `Sideline/<version> (self-hosted)` User-Agent. */
export function createDefaultSleeperClient(
  options: Omit<SleeperHttpOptions, "userAgent"> & {
    version: string;
    userAgent?: string;
    onWarning?: SleeperClientOptions["onWarning"];
  },
): SleeperClient {
  const { version, userAgent, onWarning, ...httpOptions } = options;
  const http = createSleeperHttp({
    ...httpOptions,
    userAgent: userAgent ?? sleeperUserAgent(version),
  });
  return new SleeperClient({ http, ...(onWarning ? { onWarning } : {}) });
}
