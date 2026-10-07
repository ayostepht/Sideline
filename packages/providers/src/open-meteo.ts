import { type PrecipType } from "@sideline/shared";
import { z } from "zod";
import type { FetchFn } from "./cache.js";

export const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
/** Open-Meteo serves at most 16 forecast days. */
export const MAX_FORECAST_DAYS = 16;
const USER_AGENT = "Sideline/0.0.0 (self-hosted)";

export interface KickoffForecast {
  temperatureF: number;
  windMph: number;
  gustMph: number;
  precipProbability: number;
  precipType: PrecipType;
}

export type ForecastFailure =
  "out_of_range" | "invalid_kickoff" | "network" | "parse" | "no_hour" | "no_data";

export type ForecastResult =
  | { ok: true; forecast: KickoffForecast }
  | { ok: false; reason: ForecastFailure; message?: string };

/**
 * WMO weather_code to PrecipType.
 * 51,53,55 drizzle; 61,63,65 rain; 80,81,82 rain showers; 95,96,99 thunderstorm: rain.
 * 71,73,75 snow; 77 snow grains; 85,86 snow showers: snow.
 * 56,57 freezing drizzle; 66,67 freezing rain: mixed.
 * Everything else (0-3 clear/cloud, 45,48 fog, unknown codes): none.
 */
export function precipTypeFromWmo(code: number): PrecipType {
  if ([56, 57, 66, 67].includes(code)) return "mixed";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(code)) return "rain";
  return "none";
}

const nums = z.array(z.number().nullable());
const ResponseSchema = z.looseObject({
  hourly: z.looseObject({
    time: z.array(z.string()),
    temperature_2m: nums,
    precipitation_probability: nums,
    wind_speed_10m: nums,
    wind_gusts_10m: nums,
    weather_code: nums,
  }),
});

export interface KickoffForecastArgs {
  lat: number;
  lon: number;
  kickoffUtc: string;
  now: Date;
  fetch?: FetchFn;
  timeoutMs?: number;
}

/** Kickoff-hour forecast. Never throws: any failure degrades to `{ ok: false, reason }`. */
export async function fetchKickoffForecast(args: KickoffForecastArgs): Promise<ForecastResult> {
  const kickoffMs = Date.parse(args.kickoffUtc);
  if (Number.isNaN(kickoffMs)) return { ok: false, reason: "invalid_kickoff" };
  // Open-Meteo serves whole UTC days: today (day 0) through day 15. Anything else is skipped.
  const dayDiff = Math.floor(kickoffMs / 86_400_000) - Math.floor(args.now.getTime() / 86_400_000);
  if (dayDiff < 0 || dayDiff > MAX_FORECAST_DAYS - 1) {
    return { ok: false, reason: "out_of_range" };
  }
  const hourStart = new Date(Math.floor(kickoffMs / 3_600_000) * 3_600_000);
  const hourKey = `${hourStart.toISOString().slice(0, 13)}:00`;
  const day = hourStart.toISOString().slice(0, 10);
  const params = new URLSearchParams({
    latitude: String(args.lat),
    longitude: String(args.lon),
    hourly: "temperature_2m,precipitation_probability,wind_speed_10m,wind_gusts_10m,weather_code",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    timezone: "UTC",
    start_date: day,
    end_date: day,
  });
  const fetchFn: FetchFn = args.fetch ?? ((u, init) => fetch(u, init));
  const timeoutMs = args.timeoutMs ?? 10_000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let json: unknown;
  try {
    const res = await fetchFn(`${OPEN_METEO_URL}?${params.toString()}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (res.status === 400) {
      return { ok: false, reason: "out_of_range", message: "Open-Meteo HTTP 400" };
    }
    if (!res.ok) {
      return { ok: false, reason: "network", message: `Open-Meteo HTTP ${res.status}` };
    }
    json = await res.json();
  } catch (e) {
    return {
      ok: false,
      reason: "network",
      message: ctrl.signal.aborted
        ? `Open-Meteo request timed out after ${timeoutMs} ms`
        : `Open-Meteo request failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  } finally {
    clearTimeout(timer);
  }
  const parsed = ResponseSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      reason: "parse",
      message: `Open-Meteo shape changed at ${issue?.path.join(".") ?? "?"}`,
    };
  }
  const h = parsed.data.hourly;
  const i = h.time.indexOf(hourKey);
  if (i < 0) return { ok: false, reason: "no_hour" };
  const temperatureF = h.temperature_2m[i];
  const windMph = h.wind_speed_10m[i];
  const gust = h.wind_gusts_10m[i];
  const prob = h.precipitation_probability[i];
  if (typeof temperatureF !== "number" || typeof windMph !== "number" || typeof prob !== "number") {
    return { ok: false, reason: "no_data" };
  }
  const code = h.weather_code[i];
  return {
    ok: true,
    forecast: {
      temperatureF,
      windMph,
      gustMph: typeof gust === "number" ? gust : windMph,
      precipProbability: prob,
      precipType: typeof code === "number" ? precipTypeFromWmo(code) : "none",
    },
  };
}
