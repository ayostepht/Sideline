import { z } from "zod";

export const WeatherStatusSchema = z.enum(["forecast", "indoors", "unavailable"]);
export type WeatherStatus = z.infer<typeof WeatherStatusSchema>;

export const PrecipTypeSchema = z.enum(["none", "rain", "snow", "mixed"]);
export type PrecipType = z.infer<typeof PrecipTypeSchema>;

export const WeatherFlagSchema = z.enum(["wind", "precip", "cold"]);
export type WeatherFlag = z.infer<typeof WeatherFlagSchema>;

/** ADR-022 item 9. Wind, gust and precip flag at or above; cold flags at or below. */
export const WEATHER_THRESHOLDS = {
  windMph: 15,
  gustMph: 25,
  precipProbability: 50,
  coldF: 25,
} as const;

/** Numeric fields, `precipType` and `fetchedAt` are null when `indoors` or `unavailable`. */
export const GameWeatherSchema = z.strictObject({
  season: z.number().int(),
  week: z.number().int(),
  gameId: z.string(),
  kickoffUtc: z.iso.datetime(),
  status: WeatherStatusSchema,
  temperatureF: z.number().nullable(),
  windMph: z.number().nullable(),
  gustMph: z.number().nullable(),
  precipProbability: z.number().min(0).max(100).nullable(),
  precipType: PrecipTypeSchema.nullable(),
  flags: z.array(WeatherFlagSchema),
  fetchedAt: z.iso.datetime().nullable(),
});
export type GameWeather = z.infer<typeof GameWeatherSchema>;

/** Derives flags from the thresholds; null inputs never flag. Order: wind, precip, cold. */
export function weatherFlags(w: {
  temperatureF: number | null;
  windMph: number | null;
  gustMph: number | null;
  precipProbability: number | null;
}): WeatherFlag[] {
  const flags: WeatherFlag[] = [];
  if (
    (w.windMph !== null && w.windMph >= WEATHER_THRESHOLDS.windMph) ||
    (w.gustMph !== null && w.gustMph >= WEATHER_THRESHOLDS.gustMph)
  ) {
    flags.push("wind");
  }
  if (w.precipProbability !== null && w.precipProbability >= WEATHER_THRESHOLDS.precipProbability) {
    flags.push("precip");
  }
  if (w.temperatureF !== null && w.temperatureF <= WEATHER_THRESHOLDS.coldF) flags.push("cold");
  return flags;
}
