/**
 * WX-4/WX-5 (ADR-022 items 8-9): forecast lookups for server responses. Context only (ADR-014):
 * nothing here feeds values, projections, the optimizer, sims or win probability.
 *
 * One batched `readGameWeather` per response. A game kicking off within the next 7 days (football
 * time) that has no stored row, for example after the worker's failure cap, gets a synthesized
 * `unavailable` entry so the UI can say "No forecast". Games further out, or already started,
 * return null so the UI shows nothing.
 */
import { readGameWeather, type DbHandle } from "@sideline/db";
import { WEATHER_THRESHOLDS, type GameWeather, type Reason } from "@sideline/shared";

export const FORECAST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface WeatherGameRef {
  gameId: string;
  week: number;
  kickoffUtc: string | null;
}

export function synthesizeUnavailable(game: WeatherGameRef): GameWeather {
  return {
    season: 0,
    week: game.week,
    gameId: game.gameId,
    kickoffUtc: game.kickoffUtc ?? "",
    status: "unavailable",
    temperatureF: null,
    windMph: null,
    gustMph: null,
    precipProbability: null,
    precipType: null,
    flags: [],
    fetchedAt: null,
  };
}

/** gameId -> forecast (stored or synthesized) or null. Every input game id is a key. */
export function weatherByGame(
  h: DbHandle,
  season: number,
  games: readonly WeatherGameRef[],
  now: Date,
): Map<string, GameWeather | null> {
  const unique = new Map(games.map((g) => [g.gameId, g] as const));
  const rows = readGameWeather(h, { season, gameIds: [...unique.keys()] });
  const stored = new Map(rows.map((r) => [r.gameId, r] as const));
  const out = new Map<string, GameWeather | null>();
  for (const g of unique.values()) {
    const row = stored.get(g.gameId);
    if (row !== undefined) {
      out.set(g.gameId, row);
      continue;
    }
    const kickoff = g.kickoffUtc === null ? Number.NaN : Date.parse(g.kickoffUtc);
    const inWindow =
      Number.isFinite(kickoff) &&
      kickoff > now.getTime() &&
      kickoff <= now.getTime() + FORECAST_WINDOW_MS;
    out.set(
      g.gameId,
      inWindow
        ? {
            ...synthesizeUnavailable(g),
            season,
            kickoffUtc: new Date(kickoff).toISOString(),
          }
        : null,
    );
  }
  return out;
}

/** One `WEATHER` reason per flag, plain labels, no `impact` (context only). */
export function weatherReasons(w: GameWeather | null): Reason[] {
  if (w === null || w.status !== "forecast") return [];
  const out: Reason[] = [];
  for (const flag of w.flags) {
    if (flag === "wind") {
      if (w.windMph !== null && w.windMph >= WEATHER_THRESHOLDS.windMph) {
        out.push({
          code: "WEATHER",
          label: `Wind ${String(Math.round(w.windMph))} mph`,
          value: Math.round(w.windMph),
        });
      } else if (w.gustMph !== null) {
        out.push({
          code: "WEATHER",
          label: `Gusts ${String(Math.round(w.gustMph))} mph`,
          value: Math.round(w.gustMph),
        });
      }
    } else if (flag === "precip" && w.precipProbability !== null) {
      const pct = Math.round(w.precipProbability);
      const kind =
        w.precipType === "snow" ? "Snow" : w.precipType === "rain" ? "Rain" : "Precipitation";
      out.push({ code: "WEATHER", label: `${kind} likely (${String(pct)}%)`, value: pct });
    } else if (flag === "cold" && w.temperatureF !== null) {
      const t = Math.round(w.temperatureF);
      out.push({ code: "WEATHER", label: `Cold: ${String(t)}°F`, value: t });
    }
  }
  return out;
}
