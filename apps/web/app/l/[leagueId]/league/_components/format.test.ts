import { describe, expect, it } from "vitest";
import {
  formatFaab,
  formatPowerScore,
  formatRatePercent,
  formatSignedNumber,
  sortByPowerScoreDesc,
  sortByPlayoffPctDesc,
} from "./format";

describe("formatRatePercent", () => {
  it("rounds a [0, 1] rate to a whole-number percentage", () => {
    expect(formatRatePercent(0.542)).toBe("54%");
    expect(formatRatePercent(1)).toBe("100%");
    expect(formatRatePercent(0)).toBe("0%");
  });
});

describe("formatPowerScore", () => {
  it("scales a [0, 1] composite to a 0-100 figure with one decimal", () => {
    expect(formatPowerScore(0.642)).toBe("64.2");
    expect(formatPowerScore(1)).toBe("100.0");
  });
});

describe("formatSignedNumber", () => {
  it("always shows a sign, one decimal", () => {
    expect(formatSignedNumber(1.25)).toBe("+1.3");
    expect(formatSignedNumber(-0.5)).toBe("-0.5");
    expect(formatSignedNumber(0)).toBe("+0.0");
  });
});

describe("formatFaab", () => {
  it("formats a whole-dollar amount", () => {
    expect(formatFaab(42.4)).toBe("$42");
    expect(formatFaab(0)).toBe("$0");
  });
});

describe("sortByPowerScoreDesc", () => {
  it("sorts highest composite score first without mutating the input", () => {
    const teams = [
      { rosterId: 1, powerScore: { score: 0.4 } },
      { rosterId: 2, powerScore: { score: 0.8 } },
      { rosterId: 3, powerScore: { score: 0.6 } },
    ] as unknown as Parameters<typeof sortByPowerScoreDesc>[0];
    const sorted = sortByPowerScoreDesc(teams);
    expect(sorted.map((t) => t.rosterId)).toEqual([2, 3, 1]);
    expect(teams.map((t) => t.rosterId)).toEqual([1, 2, 3]);
  });
});

describe("sortByPlayoffPctDesc", () => {
  it("sorts highest playoff percentage first", () => {
    const teams = [
      { rosterId: 1, playoffPct: 0.2 },
      { rosterId: 2, playoffPct: 0.9 },
    ];
    expect(sortByPlayoffPctDesc(teams).map((t) => t.rosterId)).toEqual([2, 1]);
  });
});
