import { stadiumLocation } from "@sideline/providers";

/**
 * Synthetic Open-Meteo responses for the fixture DB (no network, deterministic). The recorded
 * `tests/fixtures/open-meteo/forecast.json` is one stadium and one day, so the seeded week gets
 * hand-set weather per home team instead. Every other stadium gets a mild, clean forecast.
 */
export type WeatherCase = "wind" | "precip" | "cold" | "fail";

export const FIXTURE_WEATHER_CASES: Readonly<Record<string, WeatherCase>> = {
  CHI: "wind",
  BUF: "precip",
  CIN: "cold",
  PHI: "fail",
};

interface Hour {
  temp: number;
  wind: number;
  gust: number;
  prob: number;
  code: number;
}

const CLEAN: Hour = { temp: 68, wind: 6, gust: 11, prob: 5, code: 1 };
const HOURS: Record<Exclude<WeatherCase, "fail">, Hour> = {
  wind: { temp: 55, wind: 21, gust: 33, prob: 10, code: 3 },
  precip: { temp: 48, wind: 9, gust: 16, prob: 80, code: 63 },
  cold: { temp: 21, wind: 8, gust: 14, prob: 10, code: 0 },
};

function caseFor(lat: number, lon: number): WeatherCase | null {
  for (const [team, c] of Object.entries(FIXTURE_WEATHER_CASES)) {
    const s = stadiumLocation({ home: team });
    if (s && Math.abs(s.lat - lat) < 1e-3 && Math.abs(s.lon - lon) < 1e-3) return c;
  }
  return null;
}

/** Response for an Open-Meteo forecast URL, shaped like the real API (one UTC day of hours). */
export function syntheticOpenMeteo(rawUrl: string): Response {
  const q = new URL(rawUrl).searchParams;
  const c = caseFor(Number(q.get("latitude")), Number(q.get("longitude")));
  if (c === "fail") return new Response('{"error":true}', { status: 500 });
  const h = c === null ? CLEAN : HOURS[c];
  const day = q.get("start_date") ?? "1970-01-01";
  const time = Array.from({ length: 24 }, (_, i) => `${day}T${String(i).padStart(2, "0")}:00`);
  const col = (v: number): number[] => time.map(() => v);
  return new Response(
    JSON.stringify({
      hourly: {
        time,
        temperature_2m: col(h.temp),
        precipitation_probability: col(h.prob),
        wind_speed_10m: col(h.wind),
        wind_gusts_10m: col(h.gust),
        weather_code: col(h.code),
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}
