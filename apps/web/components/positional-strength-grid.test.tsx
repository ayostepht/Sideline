import type { LeagueIntelligenceHeatmapEntry } from "@sideline/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PositionalStrengthGrid } from "./positional-strength-grid";

const alpha = { rosterId: 1, teamName: "Alpha" };
const bravo = { rosterId: 2, teamName: "Bravo" };
const teams = [alpha, bravo];

function entry(overrides: Partial<LeagueIntelligenceHeatmapEntry>): LeagueIntelligenceHeatmapEntry {
  return {
    rosterId: 1,
    position: "RB",
    value: 100,
    median: 100,
    delta: 0,
    ratio: 1,
    reasons: [],
    ...overrides,
  };
}

describe("PositionalStrengthGrid", () => {
  it("renders one row per team and one column per position", () => {
    const entries = [
      entry({ rosterId: 1, position: "QB", value: 120, delta: 20, ratio: 1.2 }),
      entry({ rosterId: 2, position: "QB", value: 80, delta: -20, ratio: 0.8 }),
      entry({ rosterId: 1, position: "RB", value: 90, delta: -10, ratio: 0.9 }),
      entry({ rosterId: 2, position: "RB", value: 110, delta: 10, ratio: 1.1 }),
    ];
    const html = renderToStaticMarkup(<PositionalStrengthGrid teams={teams} entries={entries} />);
    expect(html).toContain('data-testid="positional-strength-grid"');
    expect(html).toContain("Alpha");
    expect(html).toContain("Bravo");
    expect(html).toContain("120.0");
    expect(html).toContain("+20.0");
    expect(html).toContain("-20.0");
  });

  it("always shows a numeric delta alongside the color-coded background, never color alone", () => {
    const entries = [entry({ rosterId: 1, position: "QB", value: 150, delta: 50, ratio: 1.5 })];
    const html = renderToStaticMarkup(<PositionalStrengthGrid teams={[alpha]} entries={entries} />);
    expect(html).toContain("+50.0");
    expect(html).toContain("bg-positive-soft");
  });

  it("shows a placeholder, not a blank cell, when a team has no entry for a position", () => {
    const entries = [entry({ rosterId: 1, position: "QB" })];
    const html = renderToStaticMarkup(<PositionalStrengthGrid teams={teams} entries={entries} />);
    expect(html).toContain("No data");
  });

  it("handles a null ratio (zero league median) without crashing, using the delta sign instead", () => {
    const entries = [
      entry({ rosterId: 1, position: "K", value: 0, median: 0, delta: 0, ratio: null }),
    ];
    const html = renderToStaticMarkup(<PositionalStrengthGrid teams={[alpha]} entries={entries} />);
    expect(html).toContain("0.0");
  });

  it("renders a legend explaining the color meaning in text, not color alone", () => {
    const html = renderToStaticMarkup(
      <PositionalStrengthGrid teams={teams} entries={[entry({})]} />,
    );
    expect(html).toContain("Above median");
    expect(html).toContain("Below median");
  });

  it("shows an empty message when there is no data", () => {
    const html = renderToStaticMarkup(<PositionalStrengthGrid teams={[]} entries={[]} />);
    expect(html).toContain("No positional data yet");
  });
});
