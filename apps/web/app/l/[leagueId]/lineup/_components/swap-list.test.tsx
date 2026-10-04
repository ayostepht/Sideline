import type { LineupPlayer, LineupSwap } from "@sideline/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SwapList } from "./swap-list";

function player(id: string, value: number): LineupPlayer {
  return {
    playerId: id,
    name: `Player ${id}`,
    position: "RB",
    nflTeam: "KC",
    status: null,
    injuryStatus: null,
    byeWeek: null,
    value,
    matchupGrade: null,
    matchupLabel: null,
    locked: false,
    kickoffApproximate: false,
    reasons: [],
  };
}

const players = [player("in", 12), player("out", 7)];
const swaps: LineupSwap[] = [
  { slotIndex: 0, slotType: "FLEX", playerIdIn: "in", playerIdOut: "out" },
];

describe("SwapList / materiality floor", () => {
  it("renders nothing when there are no swaps", () => {
    const html = renderToStaticMarkup(<SwapList swaps={[]} players={players} pointDelta={3.4} />);
    expect(html).toBe("");
  });

  it("renders nothing when pointDelta is below the 0.05pt floor, even with swaps present", () => {
    const zero = renderToStaticMarkup(<SwapList swaps={swaps} players={players} pointDelta={0} />);
    const tiny = renderToStaticMarkup(
      <SwapList swaps={swaps} players={players} pointDelta={0.02} />,
    );
    expect(zero).toBe("");
    expect(tiny).toBe("");
  });

  it("renders the swap list when pointDelta meets the floor", () => {
    const html = renderToStaticMarkup(
      <SwapList swaps={swaps} players={players} pointDelta={0.05} />,
    );
    expect(html).toContain('data-testid="lineup-swaps"');
    expect(html).toContain('data-testid="lineup-swap-row"');
    expect(html).toContain("Player in");
    expect(html).toContain("Player out");
  });
});
