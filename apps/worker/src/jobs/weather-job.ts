import {
  readGameWeather,
  readOutdoorGamesBetween,
  upsertGameWeather,
  type GameWeatherUpsertRow,
  type ScheduleWindowGame,
} from "@sideline/db";
import {
  createMinIntervalLimiter,
  fetchKickoffForecast,
  stadiumLocation,
  type FetchFn,
  type MinIntervalLimiter,
} from "@sideline/providers";
import type { Job, JobContext } from "../types.js";

/** Games further out than this are not fetched (WX-1). */
export const WEATHER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const WEATHER_MIN_INTERVAL_MS = 200;
/** Stop after this many fetch failures in a row (provider down). */
export const WEATHER_MAX_CONSECUTIVE_FAILURES = 3;
const INDOOR_ROOFS = new Set(["dome", "closed"]);

export interface WeatherJobDeps {
  /** Injected in tests and fixture mode; defaults to the global fetch. */
  fetch?: FetchFn;
  /** Test seam: replaces the shared Open-Meteo limiter (default 200 ms spacing). */
  limiter?: MinIntervalLimiter;
  /** Test seam: per-request timeout. */
  timeoutMs?: number;
}

/** Football "now": the game clock override when set (ADR-019), else the real clock. */
export function footballNow(ctx: JobContext): Date {
  return ctx.config.gameClock !== null ? new Date(ctx.config.gameClock) : ctx.now();
}

function emptyRow(
  g: ScheduleWindowGame,
  status: "indoors" | "unavailable",
  updatedAt: string,
): GameWeatherUpsertRow {
  return {
    season: g.season,
    week: g.week,
    gameId: g.gameId,
    kickoffUtc: g.kickoffUtc,
    status,
    temperatureF: null,
    windMph: null,
    gustMph: null,
    precipProbability: null,
    precipType: null,
    fetchedAt: null,
    updatedAt,
  };
}

/**
 * Stores kickoff-hour forecasts for games in the next 7 days (WX-1, WX-3). Never throws on
 * provider errors: a failed fetch keeps any existing row, else writes `unavailable`.
 */
export function weatherJob(deps: WeatherJobDeps = {}): Job {
  const limiter = deps.limiter ?? createMinIntervalLimiter(WEATHER_MIN_INTERVAL_MS);
  return {
    name: "weather",
    async run(ctx) {
      const now = footballNow(ctx);
      const games = readOutdoorGamesBetween(ctx.db, {
        fromUtc: now.toISOString(),
        toUtc: new Date(now.getTime() + WEATHER_WINDOW_MS).toISOString(),
      });
      if (games.length === 0) return { rowsChanged: 0, note: "no games in the next 7 days" };

      const existing = new Set<string>();
      for (const season of new Set(games.map((g) => g.season))) {
        const ids = games.filter((g) => g.season === season).map((g) => g.gameId);
        for (const w of readGameWeather(ctx.db, { season, gameIds: ids })) {
          existing.add(`${w.season}:${w.gameId}`);
        }
      }

      const updatedAt = ctx.now().toISOString();
      const rows: GameWeatherUpsertRow[] = [];
      let fetched = 0;
      let failed = 0;
      let consecutive = 0;
      let stopped = false;
      for (const g of games) {
        if (g.roof !== null && INDOOR_ROOFS.has(g.roof)) {
          rows.push(emptyRow(g, "indoors", updatedAt));
          continue;
        }
        const keep = existing.has(`${g.season}:${g.gameId}`);
        const unavailable = (): void => {
          if (!keep) rows.push(emptyRow(g, "unavailable", updatedAt));
        };
        if (stopped || ctx.signal.aborted) continue;
        const loc = stadiumLocation({ home: g.home, stadiumId: g.stadiumId });
        if (loc === null) {
          ctx.logger.warn({ gameId: g.gameId, home: g.home }, "weather: unknown stadium");
          unavailable();
          continue;
        }
        await limiter.acquire();
        const res = await fetchKickoffForecast({
          lat: loc.lat,
          lon: loc.lon,
          kickoffUtc: g.kickoffUtc,
          now,
          ...(deps.fetch ? { fetch: deps.fetch } : {}),
          ...(deps.timeoutMs !== undefined ? { timeoutMs: deps.timeoutMs } : {}),
        });
        if (res.ok) {
          fetched++;
          consecutive = 0;
          const f = res.forecast;
          rows.push({
            season: g.season,
            week: g.week,
            gameId: g.gameId,
            kickoffUtc: g.kickoffUtc,
            status: "forecast",
            temperatureF: f.temperatureF,
            windMph: f.windMph,
            gustMph: f.gustMph,
            precipProbability: f.precipProbability,
            precipType: f.precipType,
            fetchedAt: ctx.now().toISOString(),
            updatedAt,
          });
          continue;
        }
        ctx.logger.warn(
          { gameId: g.gameId, reason: res.reason, message: res.message },
          "weather forecast failed",
        );
        unavailable();
        if (res.reason === "out_of_range") continue;
        failed++;
        consecutive++;
        if (consecutive >= WEATHER_MAX_CONSECUTIVE_FAILURES) {
          stopped = true;
          ctx.logger.warn({ failed }, "weather degraded, stopping early");
        }
      }

      // One short transaction; no network call is in flight here.
      const rowsChanged = ctx.db.sqlite
        .transaction(() => upsertGameWeather(ctx.db, rows).rowsChanged)
        .immediate();
      const note = `${fetched} forecasts, ${failed} failed, ${games.length} games`;
      if (fetched === 0 && failed > 0) {
        return { rowsChanged, status: "skipped", note: `degraded: weather unavailable (${note})` };
      }
      return { rowsChanged, note };
    },
  };
}
