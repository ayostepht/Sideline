import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScoreRange } from "./score-range";

describe("ScoreRange", () => {
  const teams = [
    { label: "Sideline Squad", p10: 85, p50: 100, p90: 115, highlight: true },
    { label: "Rival Rosters", p10: 70, p50: 90, p90: 110 },
  ];

  it("shows every p10/p50/p90 number as real text, not only in the decorative chart", () => {
    const html = renderToStaticMarkup(<ScoreRange teams={teams} label="Projected score range" />);
    // The decorative SVG carries no accessible name of its own.
    expect(html).not.toMatch(/<svg[^>]*role="img"/);
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    // The visible legend has the numbers for both teams.
    expect(html).toContain("85.0");
    expect(html).toContain("115.0");
    expect(html).toContain("100.0");
    expect(html).toContain("70.0");
    expect(html).toContain("110.0");
    expect(html).toContain("90.0");
  });

  it("includes a screen-reader table alternative captioned with the accessible label", () => {
    const html = renderToStaticMarkup(<ScoreRange teams={teams} label="Projected score range" />);
    expect(html).toContain("<table");
    expect(html).toContain("<caption>Projected score range</caption>");
    expect(html).toContain("Sideline Squad");
    expect(html).toContain("Rival Rosters");
  });
});
