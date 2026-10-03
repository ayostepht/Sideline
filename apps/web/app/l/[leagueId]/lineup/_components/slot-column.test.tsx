import type { LineupPlayer, LineupSlotAssignment } from "@sideline/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SlotColumn } from "./slot-column";

const player: LineupPlayer = {
  playerId: "p1",
  name: "Test Player",
  position: "WR",
  nflTeam: "KC",
  status: "Active",
  injuryStatus: null,
  byeWeek: null,
  value: 18.4,
  matchupGrade: null,
  matchupLabel: null,
  locked: false,
  kickoffApproximate: false,
  reasons: [{ code: "USAGE_UP", label: "Usage trending up", impact: 1.2 }],
};

const assignment: LineupSlotAssignment[] = [{ slotType: "WR", playerId: "p1" }];

describe("SlotColumn / inline reasons", () => {
  it("shows no inline reason chips when showReasons is true, only the Why trigger", () => {
    const html = renderToStaticMarkup(
      <SlotColumn
        title="Optimal"
        assignment={assignment}
        players={[player]}
        mode="projected"
        week={1}
        showReasons
        testid="lineup-optimal"
      />,
    );
    expect(html).not.toContain('data-testid="reason-chips"');
    expect(html).not.toContain('data-testid="reason-chip"');
    expect(html).not.toContain("Usage trending up");
    expect(html).toContain('data-testid="why-trigger"');
  });

  it("renders no Why trigger and no reasons when showReasons is false", () => {
    const html = renderToStaticMarkup(
      <SlotColumn
        title="Current"
        assignment={assignment}
        players={[player]}
        mode="projected"
        week={1}
        showReasons={false}
        testid="lineup-current"
      />,
    );
    expect(html).not.toContain('data-testid="why-trigger"');
    expect(html).not.toContain("Usage trending up");
  });
});
