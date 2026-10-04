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

  it("draws the range line in a high-contrast foreground color, not a background-fill token", () => {
    // Regression for a UX review finding: `text-muted`/`text-accent-soft` are background-fill
    // tokens that read at ~1.1-1.5:1 against the card background as a thin stroke, well under
    // the WCAG 3:1 non-text-contrast minimum. `text-muted-foreground` and `text-highlight` both
    // clear 3:1 against `--card` in light and dark (measured: 6.9:1 / 3.77:1 light, 8.95:1 /
    // 3.35:1 dark).
    const html = renderToStaticMarkup(<ScoreRange teams={teams} label="Projected score range" />);
    const lines = [...html.matchAll(/<line[^>]*class="([^"]*)"[^>]*>/g)].map((m) => m[1] ?? "");
    expect(lines).toHaveLength(2);
    expect(lines.some((cls) => cls.includes("text-highlight"))).toBe(true);
    expect(lines.some((cls) => cls.includes("text-muted-foreground"))).toBe(true);
    expect(lines.some((cls) => cls.includes("text-accent-soft"))).toBe(false);
    expect(lines.some((cls) => cls.split(/\s+/).includes("text-muted"))).toBe(false);
  });
});
