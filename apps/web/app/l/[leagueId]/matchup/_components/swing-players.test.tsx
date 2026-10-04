import type { MatchupSwingPlayer } from "@sideline/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SwingPlayersList } from "./swing-players";

const players: MatchupSwingPlayer[] = [
  { playerId: "p1", name: "High Variance Guy", rosterId: 1, varianceContribution: 25 },
  { playerId: "p2", name: "Steady Eddie", rosterId: 2, varianceContribution: 4 },
];

describe("SwingPlayersList", () => {
  it("labels each player's team and converts variance to a points swing figure", () => {
    const html = renderToStaticMarkup(
      <SwingPlayersList players={players} yourRosterId={1} opponentTeamName="Rival Rosters" />,
    );
    expect(html).toContain("High Variance Guy");
    expect(html).toContain("Steady Eddie");
    expect(html).toContain(">You<");
    expect(html).toContain("Rival Rosters");
    // sqrt(25) = 5.0, sqrt(4) = 2.0
    expect(html).toContain("±5.0");
    expect(html).toContain("±2.0");
  });

  it("renders a plain-language empty state instead of an empty list", () => {
    const html = renderToStaticMarkup(
      <SwingPlayersList players={[]} yourRosterId={1} opponentTeamName="Rival Rosters" />,
    );
    expect(html).toContain('data-testid="matchup-swing-empty"');
    expect(html).not.toContain('data-testid="matchup-swing-list"');
  });
});
