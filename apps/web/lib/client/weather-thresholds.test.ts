import { WEATHER_THRESHOLDS } from "@sideline/shared";
import { describe, expect, it } from "vitest";
import { CLIENT_WEATHER_THRESHOLDS } from "./weather-thresholds";

describe("CLIENT_WEATHER_THRESHOLDS", () => {
  it("matches the shared thresholds", () => {
    expect(CLIENT_WEATHER_THRESHOLDS.windMph).toBe(WEATHER_THRESHOLDS.windMph);
    expect(CLIENT_WEATHER_THRESHOLDS.gustMph).toBe(WEATHER_THRESHOLDS.gustMph);
  });
});
