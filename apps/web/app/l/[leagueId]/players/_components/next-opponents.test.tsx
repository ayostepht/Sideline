import type { NextOpponentWeek } from "@sideline/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NextOpponentsBody } from "./next-opponents";

const wk = (over: Partial<NextOpponentWeek>): NextOpponentWeek => ({
  week: 6,
  bye: false,
  opponent: "DAL",
  home: true,
  grade: "A",
  gradeLabel: "Great matchup",
  ptsAllowedPg: 24.1,
  rank: 2,
  totalTeams: 32,
  ...over,
});
const html = (n: Parameters<typeof NextOpponentsBody>[0]["nextOpponents"]) =>
  renderToStaticMarkup(<NextOpponentsBody nextOpponents={n} position="WR" />);

describe("NextOpponentsBody", () => {
  it("renders weeks in order with vs, at and Bye", () => {
    const out = html({
      reasonUnavailable: null,
      weeks: [
        wk({ week: 6 }),
        wk({ week: 7, home: false, opponent: "NYG", grade: "D", ptsAllowedPg: 12 }),
        wk({ week: 8, bye: true, opponent: null, home: null, grade: null, ptsAllowedPg: null }),
        wk({ week: 9, opponent: "BUF", grade: null, ptsAllowedPg: null }),
      ],
    });
    expect(out.match(/player-next-opponent-row/g)).toHaveLength(4);
    expect(out.indexOf("Wk 6")).toBeLessThan(out.indexOf("Wk 9"));
    expect(out).toContain("vs DAL");
    expect(out).toContain("at NYG");
    expect(out).toContain("Bye");
    expect(out).toContain("Not graded yet");
  });

  it("shows letter, label and number", () => {
    const out = html({ reasonUnavailable: null, weeks: [wk({})] });
    expect(out).toContain("great matchup");
    expect(out).toContain(">A<");
    expect(out).toContain("24.1 pts per game allowed to WRs");
  });

  it("has no button and puts the explainer after the list", () => {
    const out = html({ reasonUnavailable: null, weeks: [wk({})] });
    expect(out).not.toContain("<button");
    expect(out.indexOf("player-next-opponents-note")).toBeGreaterThan(
      out.lastIndexOf("player-next-opponent-row"),
    );
    expect(out).toContain("context only");
  });

  it("shows the reason when unavailable", () => {
    expect(html({ reasonUnavailable: "No team", weeks: [] })).toContain("No team");
  });

  it("shows empty copy for no weeks", () => {
    expect(html({ reasonUnavailable: null, weeks: [] })).toContain("No upcoming games.");
  });

  it("keeps the placeholder when undefined", () => {
    expect(html(undefined)).toContain("available yet");
  });
});
