import { describe, expect, it } from "vitest";
import {
  AUTO_SAFE_ABOVE,
  AUTO_UPSIDE_BELOW,
  GameWeatherSchema,
  LineupModeChoiceSchema,
  LineupModeSchema,
  LineupRequestSchema,
  TRADE_FAIR_RATIO_MIN,
  TRADE_FINDER_PLAYOFF_TOP_N,
  TRADE_LEANS_RATIO_MIN,
  TRADE_MAX_PLAYERS_PER_SIDE,
  TradeEvaluateRequestSchema,
  TradeEvaluateResponseSchema,
  TradeFairnessSchema,
  TradeFinderResponseSchema,
  TradeSuggestionSchema,
  WEATHER_THRESHOLDS,
  weatherFlags,
} from "./index.js";

describe("lineup mode contracts", () => {
  it("keeps 3 concrete modes and 4 choices", () => {
    expect(LineupModeSchema.options).toHaveLength(3);
    expect(LineupModeChoiceSchema.options).toEqual(["projected", "safe", "upside", "auto"]);
    expect(LineupModeSchema.safeParse("auto").success).toBe(false);
  });
  it("request accepts auto and defaults to projected", () => {
    expect(LineupRequestSchema.parse({ mode: "auto" }).mode).toBe("auto");
    expect(LineupRequestSchema.parse({}).mode).toBe("projected");
  });
  it("exports Auto thresholds", () => {
    expect(AUTO_UPSIDE_BELOW).toBe(0.35);
    expect(AUTO_SAFE_ABOVE).toBe(0.65);
  });
});

const ref = (id: string) => ({ playerId: id, name: `N${id}`, position: "RB", nflTeam: "KC" });
const impact = (playoff: number | null) => ({
  rosterId: 1,
  rosLineupBefore: 100,
  rosLineupAfter: 105,
  rosLineupDelta: 5,
  playoffPctBefore: playoff,
  playoffPctAfter: playoff,
  playoffPctDelta: playoff === null ? null : 0,
  dropped: [ref("9")],
  reasons: [],
});
const fresh = { updatedAt: null, stale: true };

describe("trade contracts", () => {
  it("constants", () => {
    expect(TRADE_MAX_PLAYERS_PER_SIDE).toBe(3);
    expect(TRADE_FINDER_PLAYOFF_TOP_N).toBe(10);
    expect(TRADE_FAIR_RATIO_MIN).toBe(0.75);
    expect(TRADE_LEANS_RATIO_MIN).toBe(0.4);
    expect(TradeFairnessSchema.options).toHaveLength(4);
  });
  it("request valid and invalid cases", () => {
    const ok = { otherRosterId: 2, give: ["a"], get: ["b", "c", "d"] };
    expect(TradeEvaluateRequestSchema.safeParse(ok).success).toBe(true);
    const bad = (o: object) => TradeEvaluateRequestSchema.safeParse({ ...ok, ...o }).success;
    expect(bad({ give: [] })).toBe(false);
    expect(bad({ get: ["a", "b", "c", "d"] })).toBe(false);
    expect(bad({ give: ["a", "a"] })).toBe(false);
    expect(bad({ otherRosterId: 0 })).toBe(false);
    expect(bad({ otherRosterId: 1.5 })).toBe(false);
    expect(bad({ extra: 1 })).toBe(false);
  });
  it("response, suggestion and finder parse; nullable playoff fields; strict", () => {
    const resp = {
      give: [ref("1")],
      get: [ref("2")],
      mine: impact(null),
      theirs: impact(50),
      fairness: "leans_them",
      reasons: [],
      freshness: fresh,
    };
    expect(TradeEvaluateResponseSchema.safeParse(resp).success).toBe(true);
    expect(TradeEvaluateResponseSchema.safeParse({ ...resp, fairness: "meh" }).success).toBe(false);
    expect(TradeEvaluateResponseSchema.safeParse({ ...resp, extra: 1 }).success).toBe(false);
    const sug = {
      otherRosterId: 2,
      give: resp.give,
      get: resp.get,
      mine: resp.mine,
      theirs: resp.theirs,
      fairness: resp.fairness,
      reasons: resp.reasons,
    };
    expect(TradeSuggestionSchema.safeParse(sug).success).toBe(true);
    const finder = { suggestions: [sug], evaluatedCount: 3, freshness: fresh };
    expect(TradeFinderResponseSchema.safeParse(finder).success).toBe(true);
    expect(TradeFinderResponseSchema.safeParse({ ...finder, evaluatedCount: -1 }).success).toBe(
      false,
    );
  });
});

const wx = {
  season: 2026,
  week: 5,
  gameId: "g1",
  kickoffUtc: "2026-10-11T17:00:00.000Z",
  status: "forecast",
  temperatureF: 40,
  windMph: 10,
  gustMph: 18,
  precipProbability: 20,
  precipType: "rain",
  flags: [],
  fetchedAt: "2026-10-09T12:00:00.000Z",
};

describe("weather contracts", () => {
  it("parses forecast and indoors rows", () => {
    expect(GameWeatherSchema.safeParse(wx).success).toBe(true);
    const indoors = {
      ...wx,
      status: "indoors",
      temperatureF: null,
      windMph: null,
      gustMph: null,
      precipProbability: null,
      precipType: null,
      fetchedAt: null,
    };
    expect(GameWeatherSchema.safeParse(indoors).success).toBe(true);
  });
  it("rejects bad values", () => {
    expect(GameWeatherSchema.safeParse({ ...wx, precipProbability: 101 }).success).toBe(false);
    expect(GameWeatherSchema.safeParse({ ...wx, precipProbability: -1 }).success).toBe(false);
    expect(GameWeatherSchema.safeParse({ ...wx, status: "snowing" }).success).toBe(false);
    expect(GameWeatherSchema.safeParse({ ...wx, kickoffUtc: "soon" }).success).toBe(false);
    expect(GameWeatherSchema.safeParse({ ...wx, extra: 1 }).success).toBe(false);
  });
  it("thresholds", () => {
    expect(WEATHER_THRESHOLDS).toEqual({
      windMph: 15,
      gustMph: 25,
      precipProbability: 50,
      coldF: 25,
    });
  });
  describe("weatherFlags boundaries", () => {
    const calm = { temperatureF: 60, windMph: 5, gustMph: 10, precipProbability: 10 };
    it("none for calm and for all-null", () => {
      expect(weatherFlags(calm)).toEqual([]);
      expect(
        weatherFlags({ temperatureF: null, windMph: null, gustMph: null, precipProbability: null }),
      ).toEqual([]);
    });
    it("wind 14.9 vs 15", () => {
      expect(weatherFlags({ ...calm, windMph: 14.9 })).toEqual([]);
      expect(weatherFlags({ ...calm, windMph: 15 })).toEqual(["wind"]);
    });
    it("gust 24.9 vs 25", () => {
      expect(weatherFlags({ ...calm, gustMph: 24.9 })).toEqual([]);
      expect(weatherFlags({ ...calm, gustMph: 25 })).toEqual(["wind"]);
    });
    it("precip 49 vs 50", () => {
      expect(weatherFlags({ ...calm, precipProbability: 49 })).toEqual([]);
      expect(weatherFlags({ ...calm, precipProbability: 50 })).toEqual(["precip"]);
    });
    it("cold 25.1 vs 25", () => {
      expect(weatherFlags({ ...calm, temperatureF: 25.1 })).toEqual([]);
      expect(weatherFlags({ ...calm, temperatureF: 25 })).toEqual(["cold"]);
    });
    it("combines flags in order, wind once", () => {
      expect(
        weatherFlags({ temperatureF: 10, windMph: 20, gustMph: 30, precipProbability: 80 }),
      ).toEqual(["wind", "precip", "cold"]);
    });
  });
});
