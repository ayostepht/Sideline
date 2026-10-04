import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WinProbability } from "./win-probability";

describe("WinProbability", () => {
  it("leads with a plain-English headline and shows the full You/opponent/tie breakdown", () => {
    const html = renderToStaticMarkup(
      <WinProbability
        teamName="Sideline Squad"
        teamProbability={0.63}
        opponentName="Rival Rosters"
        opponentProbability={0.35}
        tieProbability={0.02}
      />,
    );
    expect(html).toContain("You have a 63% chance to win against Rival Rosters");
    expect(html).toContain("Sideline Squad");
    expect(html).toContain("Rival Rosters");
    expect(html).toContain("63%");
    expect(html).toContain("35%");
    expect(html).toContain("2%");
  });

  it("rounds probabilities rather than truncating", () => {
    const html = renderToStaticMarkup(
      <WinProbability
        teamName="A"
        teamProbability={0.504}
        opponentName="B"
        opponentProbability={0.486}
        tieProbability={0.01}
      />,
    );
    expect(html).toContain("50%");
    expect(html).toContain("49%");
    expect(html).toContain("1%");
  });
});
