import type { PlayerWeekRow } from "@sideline/shared";
import { describe, expect, it } from "vitest";
import {
  formatOpponent,
  formatRelativeTime,
  formatWeekPts,
  formatWeekRank,
  initials,
  needsNewsRefresh,
  weekResultLabel,
  weekRowKind,
} from "./player-card-format";

const row = (o: Partial<PlayerWeekRow> = {}): PlayerWeekRow => ({
  week: 3,
  opponent: "KC",
  isHome: true,
  isBye: false,
  actualPts: 12.34,
  projectedPts: 10,
  positionRank: 12,
  isBoom: false,
  isBust: false,
  inProgress: false,
  ...o,
});

describe("formatOpponent", () => {
  it("marks away, home, bye and unknown", () => {
    expect(formatOpponent(row({ isHome: false }))).toBe("@KC");
    expect(formatOpponent(row())).toBe("KC");
    expect(formatOpponent(row({ isBye: true, opponent: null, isHome: null }))).toBe("BYE");
    expect(formatOpponent(row({ opponent: null, isHome: null }))).toBe("–");
  });
});

describe("week row labels", () => {
  it("classifies rows", () => {
    expect(weekRowKind(row({ isBye: true }))).toBe("bye");
    expect(weekRowKind(row({ inProgress: true }))).toBe("live");
    expect(weekRowKind(row({ actualPts: null }))).toBe("dnp");
    expect(weekRowKind(row())).toBe("played");
  });
  it("formats points", () => {
    expect(formatWeekPts(row())).toBe("12.3");
    expect(formatWeekPts(row({ actualPts: null }))).toBe("DNP");
    expect(formatWeekPts(row({ isBye: true, actualPts: null }))).toBe("Bye");
  });
  it("formats rank with position", () => {
    expect(formatWeekRank(row(), "WR")).toBe("WR12");
    expect(formatWeekRank(row({ positionRank: null }), "WR")).toBe("–");
  });
  it("labels boom and bust as text, not on DNP or bye", () => {
    expect(weekResultLabel(row({ isBoom: true }))).toBe("Boom");
    expect(weekResultLabel(row({ isBust: true }))).toBe("Bust");
    expect(weekResultLabel(row())).toBeNull();
    expect(weekResultLabel(row({ isBust: true, actualPts: null }))).toBeNull();
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-10-06T12:00:00Z");
  it("buckets by age", () => {
    expect(formatRelativeTime("2026-10-06T11:59:40Z", now)).toBe("just now");
    expect(formatRelativeTime("2026-10-06T11:55:00Z", now)).toBe("5m ago");
    expect(formatRelativeTime("2026-10-06T09:00:00Z", now)).toBe("3h ago");
    expect(formatRelativeTime("2026-10-04T12:00:00Z", now)).toBe("2d ago");
    expect(formatRelativeTime("2026-09-01T12:00:00Z", now)).toBe("Sep 1");
    expect(formatRelativeTime("2026-10-06T13:00:00Z", now)).toBe("just now");
    expect(formatRelativeTime("nope", now)).toBe("");
  });
});

describe("needsNewsRefresh", () => {
  const now = new Date("2026-10-06T12:00:00Z");
  it("refreshes when never fetched or older than 60 minutes", () => {
    expect(needsNewsRefresh(null, now)).toBe(true);
    expect(needsNewsRefresh(undefined, now)).toBe(true);
    expect(needsNewsRefresh("bad", now)).toBe(true);
    expect(needsNewsRefresh("2026-10-06T10:59:00Z", now)).toBe(true);
    expect(needsNewsRefresh("2026-10-06T11:30:00Z", now)).toBe(false);
  });
});

describe("initials", () => {
  it("takes first and last initials", () => {
    expect(initials("Justin Jefferson")).toBe("JJ");
    expect(initials("Amon-Ra St. Brown")).toBe("AB");
    expect(initials("Cher")).toBe("C");
    expect(initials("  ")).toBe("?");
  });
});
