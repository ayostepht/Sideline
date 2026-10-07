/**
 * Mirrors the wind thresholds in WEATHER_THRESHOLDS (packages/shared, ADR-022 item 9). A test keeps
 * them equal, so client code skips the shared runtime (and with it zod) in route JS.
 */
export const CLIENT_WEATHER_THRESHOLDS = { windMph: 15, gustMph: 25 } as const;
