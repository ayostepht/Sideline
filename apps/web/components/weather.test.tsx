import type { GameWeather } from "@sideline/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReasonChips } from "./reason-chips";
import { WeatherChips, WeatherLine, weatherChipsFromWeather } from "./weather";

const base: GameWeather = {
  season: 2026,
  week: 5,
  gameId: "g",
  kickoffUtc: "2026-10-04T17:00:00.000Z",
  status: "forecast",
  temperatureF: 54,
  windMph: 18,
  gustMph: 24,
  precipProbability: 20,
  precipType: "rain",
  flags: ["wind"],
  fetchedAt: "2026-10-03T00:00:00.000Z",
};
const h = (n: React.ReactElement) => renderToStaticMarkup(n);

describe("weather", () => {
  it("chip has icon and label", () => {
    const html = h(<WeatherChips chips={weatherChipsFromWeather(base)} />);
    expect(html).toContain('data-testid="weather-chip"');
    expect(html).toContain("Wind 18 mph");
    expect(html).toContain("<svg");
  });
  it("WEATHER reasons render as weather chips", () => {
    const html = h(<ReasonChips reasons={[{ code: "WEATHER", label: "Rain likely (70%)" }]} />);
    expect(html).toContain('data-testid="weather-chip"');
    expect(html).not.toContain('data-testid="reason-chip"');
  });
  it("no chips for clean or indoors", () => {
    expect(weatherChipsFromWeather({ ...base, flags: [] })).toEqual([]);
    expect(weatherChipsFromWeather({ ...base, status: "indoors", flags: [] })).toEqual([]);
    expect(weatherChipsFromWeather(null)).toEqual([]);
  });
  it("line: forecast with flags", () => {
    const html = h(<WeatherLine weather={base} />);
    expect(html).toContain("54°F");
    expect(html).toContain("wind 18 mph");
    expect(html).toContain("20% rain");
    expect(html).toContain("(flagged)");
  });
  it("line: indoors, unavailable, null", () => {
    expect(h(<WeatherLine weather={{ ...base, status: "indoors" }} />)).toContain("Indoors");
    expect(h(<WeatherLine weather={{ ...base, status: "unavailable" }} />)).toContain(
      "No forecast",
    );
    expect(h(<WeatherLine weather={null} />)).toBe("");
  });
});
