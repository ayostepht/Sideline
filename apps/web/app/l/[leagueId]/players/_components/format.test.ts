import { describe, expect, it } from "vitest";
import {
  buildPlayersHref,
  formatConsistency,
  formatDelta,
  formatNetCount,
  formatPpg,
  formatUsageDelta,
  formatUsageValue,
  normalizePlayersQuery,
  parsePageParam,
  parsePositionParam,
  parseQueryParam,
  playerHref,
  signalToTrend,
  sortedWeeklySeries,
} from "./format";

describe("parsePositionParam", () => {
  it("accepts known positions, case insensitive", () => {
    expect(parsePositionParam("qb")).toBe("QB");
    expect(parsePositionParam("DEF")).toBe("DEF");
  });
  it("falls back to undefined for missing or unknown values", () => {
    expect(parsePositionParam(undefined)).toBeUndefined();
    expect(parsePositionParam(null)).toBeUndefined();
    expect(parsePositionParam("")).toBeUndefined();
    expect(parsePositionParam("FLEX")).toBeUndefined();
  });
  it("takes the first of a repeated param", () => {
    expect(parsePositionParam(["rb", "wr"])).toBe("RB");
  });
});

describe("normalizePlayersQuery", () => {
  it("trims and caps length at 40", () => {
    expect(normalizePlayersQuery("  Josh Allen  ")).toBe("Josh Allen");
    expect(normalizePlayersQuery("a".repeat(50))).toBe("a".repeat(40));
  });
  it("returns undefined for blank input", () => {
    expect(normalizePlayersQuery("   ")).toBeUndefined();
    expect(normalizePlayersQuery("")).toBeUndefined();
  });
});

describe("parseQueryParam", () => {
  it("normalizes a string param", () => {
    expect(parseQueryParam(" Allen ")).toBe("Allen");
  });
  it("is undefined for missing or blank values", () => {
    expect(parseQueryParam(undefined)).toBeUndefined();
    expect(parseQueryParam(null)).toBeUndefined();
    expect(parseQueryParam("  ")).toBeUndefined();
  });
  it("takes the first of a repeated param", () => {
    expect(parseQueryParam(["Allen", "Mahomes"])).toBe("Allen");
  });
});

describe("parsePageParam", () => {
  it("parses a positive integer string", () => {
    expect(parsePageParam("3")).toBe(3);
  });
  it("falls back to 1 for zero, negative, non-numeric, or missing values", () => {
    expect(parsePageParam("0")).toBe(1);
    expect(parsePageParam("-1")).toBe(1);
    expect(parsePageParam("abc")).toBe(1);
    expect(parsePageParam(undefined)).toBe(1);
    expect(parsePageParam(null)).toBe(1);
  });
});

describe("buildPlayersHref", () => {
  it("omits page when 1 and omits unset filters", () => {
    expect(buildPlayersHref("abc", { page: 1 })).toBe("/l/abc/players");
  });
  it("includes page, position, and q when set", () => {
    expect(buildPlayersHref("abc", { page: 2, position: "RB", q: "Allen" })).toBe(
      "/l/abc/players?page=2&position=RB&q=Allen",
    );
  });
});

describe("playerHref", () => {
  it("builds a detail link, encoding the player id", () => {
    expect(playerHref("abc", "123 x")).toBe("/l/abc/players/123%20x");
  });
});

describe("formatPpg", () => {
  it("formats with one decimal", () => {
    expect(formatPpg(14.26)).toBe("14.3");
    expect(formatPpg(0)).toBe("0.0");
  });
  it("placeholders null", () => {
    expect(formatPpg(null)).toBe("—");
  });
});

describe("formatDelta", () => {
  it("always shows a sign for non-zero values", () => {
    expect(formatDelta(3.44)).toBe("+3.4");
    expect(formatDelta(-1.2)).toBe("-1.2");
    expect(formatDelta(0)).toBe("0.0");
  });
  it("placeholders null", () => {
    expect(formatDelta(null)).toBe("—");
  });
});

describe("signalToTrend", () => {
  it("maps every known signal", () => {
    expect(signalToTrend("Rising")).toBe("rising");
    expect(signalToTrend("Steady")).toBe("steady");
    expect(signalToTrend("Falling")).toBe("falling");
  });
  it("is null for null", () => {
    expect(signalToTrend(null)).toBeNull();
  });
});

describe("sortedWeeklySeries", () => {
  it("sorts ascending by week without mutating the input", () => {
    const input = [
      { week: 3, actualPts: 9 },
      { week: 1, actualPts: 12 },
      { week: 2, actualPts: 7 },
    ];
    const copy = [...input];
    expect(sortedWeeklySeries(input).map((w) => w.week)).toEqual([1, 2, 3]);
    expect(input).toEqual(copy);
  });
});

describe("formatUsageValue", () => {
  it("formats fraction fields as whole percentages", () => {
    expect(formatUsageValue("snapPct", 0.653)).toBe("65%");
    expect(formatUsageValue("targetShare", 0.1)).toBe("10%");
  });
  it("formats rzTouches as a one-decimal count", () => {
    expect(formatUsageValue("rzTouches", 1.333)).toBe("1.3");
  });
  it("placeholders null", () => {
    expect(formatUsageValue("snapPct", null)).toBe("—");
  });
});

describe("formatUsageDelta", () => {
  it("signs percentage fields in whole points", () => {
    expect(formatUsageDelta("snapPct", 0.05)).toBe("+5%");
    expect(formatUsageDelta("targetShare", -0.08)).toBe("-8%");
  });
  it("signs count fields with one decimal", () => {
    expect(formatUsageDelta("rzTouches", -0.5)).toBe("-0.5");
  });
  it("placeholders null", () => {
    expect(formatUsageDelta("snapPct", null)).toBe("—");
  });
});

describe("formatConsistency", () => {
  it("formats as a whole percentage", () => {
    expect(formatConsistency(0.417)).toBe("42%");
  });
});

describe("formatNetCount", () => {
  it("signs positive values only (negative already carries its own sign)", () => {
    expect(formatNetCount(240)).toBe("+240");
    expect(formatNetCount(-80)).toBe("-80");
    expect(formatNetCount(0)).toBe("0");
  });
});

describe("usageEmptyMessage and formatNetCount", () => {
  it("returns null when there are fields", async () => {
    const { usageEmptyMessage } = await import("./format");
    expect(usageEmptyMessage({ fields: [1], reasons: [{ label: "x" }] })).toBeNull();
  });
  it("returns the first reason label when empty, else a default", async () => {
    const { usageEmptyMessage } = await import("./format");
    expect(
      usageEmptyMessage({ fields: [], reasons: [{ label: "We don't track usage stats for K" }] }),
    ).toBe("We don't track usage stats for K");
    expect(usageEmptyMessage({ fields: [], reasons: [] })).toBe(
      "No usage data tracked for this position.",
    );
  });
  it("formats net counts with separators", async () => {
    const { formatNetCount } = await import("./format");
    expect(formatNetCount(59800)).toBe("+59,800");
    expect(formatNetCount(-80)).toBe("-80");
  });
});
