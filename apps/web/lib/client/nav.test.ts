import { describe, expect, it } from "vitest";
import {
  activeNavKey,
  stepWeek,
  clampWeek,
  isNavActive,
  navHref,
  NAV_ITEMS,
  normalizeSearchQuery,
  parseWeek,
  resolvePendingAfterUrlChange,
  resolveWeek,
  searchResultHref,
  switchLeagueHref,
  withWeekParam,
} from "./nav";

const L = "100";
const item = (k: string) => {
  const found = NAV_ITEMS.find((i) => i.key === k);
  if (!found) throw new Error(k);
  return found;
};

describe("week params", () => {
  it("parses valid weeks and rejects junk", () => {
    expect(parseWeek("5")).toBe(5);
    expect(parseWeek("18")).toBe(18);
    expect(parseWeek("0")).toBeNull();
    expect(parseWeek("19")).toBeNull();
    expect(parseWeek("3.5")).toBeNull();
    expect(parseWeek("abc")).toBeNull();
    expect(parseWeek("")).toBeNull();
    expect(parseWeek(null)).toBeNull();
    expect(parseWeek(["7", "8"])).toBe(7);
  });
  it("clamps", () => {
    expect(clampWeek(0)).toBe(1);
    expect(clampWeek(40)).toBe(18);
    expect(clampWeek(Number.NaN)).toBe(1);
    expect(clampWeek(6.9)).toBe(6);
  });
  it("resolves explicit, current and preseason", () => {
    expect(resolveWeek("4", 9)).toBe(4);
    expect(resolveWeek("99", 9)).toBe(9);
    expect(resolveWeek(null, 12)).toBe(12);
    expect(resolveWeek(null, null)).toBeNull();
  });
  it("sets week and keeps other params", () => {
    expect(withWeekParam("mode=safe&week=2", 5)).toBe("mode=safe&week=5");
    expect(withWeekParam("", 30)).toBe("week=18");
  });
});

describe("nav matching", () => {
  it("matches home only exactly", () => {
    expect(isNavActive("/l/100", L, item("home"))).toBe(true);
    expect(isNavActive("/l/100/", L, item("home"))).toBe(true);
    expect(isNavActive("/l/100/lineup", L, item("home"))).toBe(false);
  });
  it("matches nested routes and keeps team and league distinct", () => {
    expect(activeNavKey("/l/100/league/teams/3", L)).toBe("league");
    expect(activeNavKey("/l/100/team", L)).toBe("team");
    expect(activeNavKey("/l/100/settings", L)).toBe("settings");
    expect(activeNavKey("/l/100/leagueX", L)).toBeNull();
    expect(activeNavKey("/l/200/lineup", L)).toBeNull();
  });
  it("builds hrefs with optional week", () => {
    expect(navHref(L, item("home"), null)).toBe("/l/100");
    expect(navHref(L, item("lineup"), 5)).toBe("/l/100/lineup?week=5");
  });
});

describe("search", () => {
  const base = { playerId: "p 1", name: "A", position: "QB", nflTeam: "KC", injuryStatus: null };
  it("links rostered players to the owner team with highlight", () => {
    expect(searchResultHref(L, { ...base, owner: { rosterId: 4, teamName: "T" } })).toBe(
      "/l/100/league/teams/4?highlight=p%201",
    );
  });
  it("returns null for free agents", () => {
    expect(searchResultHref(L, { ...base, owner: null })).toBeNull();
  });
  it("needs two characters", () => {
    expect(normalizeSearchQuery(" a ")).toBeNull();
    expect(normalizeSearchQuery(" ab ")).toBe("ab");
  });
});

describe("switchLeagueHref", () => {
  it("keeps section and week", () => {
    expect(switchLeagueHref("/l/A/lineup", "week=5&mode=x", "A", "B")).toBe("/l/B/lineup?week=5");
  });
  it("drops invalid week and handles home", () => {
    expect(switchLeagueHref("/l/A", "week=99", "A", "B")).toBe("/l/B");
    expect(switchLeagueHref("/l/A/", "", "A", "B")).toBe("/l/B");
  });
  it("falls back to league for team detail", () => {
    expect(switchLeagueHref("/l/A/league/teams/3", "week=2", "A", "B")).toBe("/l/B/league?week=2");
  });
  it("falls back to home for foreign paths", () => {
    expect(switchLeagueHref("/onboarding", "", "A", "B")).toBe("/l/B");
  });
});

describe("stepWeek", () => {
  it("stacks steps from the latest requested week", () => {
    const first = stepWeek(6, -1);
    expect(first).toBe(5);
    expect(stepWeek(first ?? 0, -1)).toBe(4);
  });
  it("respects bounds 1 to 18", () => {
    expect(stepWeek(1, -1)).toBeNull();
    expect(stepWeek(18, 1)).toBeNull();
    expect(stepWeek(2, -1)).toBe(1);
    expect(stepWeek(17, 1)).toBe(18);
  });
});

describe("resolvePendingAfterUrlChange (m1: week-selector resync race)", () => {
  it("leaves nothing pending alone", () => {
    expect(resolvePendingAfterUrlChange(null, 4)).toBeNull();
  });
  it("clears pending once the URL confirms that exact target", () => {
    expect(resolvePendingAfterUrlChange(5, 5)).toBeNull();
  });
  it("keeps a newer pending target when a stale, older commit lands out of order", () => {
    // week=4, click Next (pending=5), click Next again before the URL commits (pending=6),
    // then the first replace's URL finally lands at 5 (not 6).
    expect(resolvePendingAfterUrlChange(6, 5)).toBe(6);
  });

  it("reproduces the double-click-before-commit sequence end to end", () => {
    // Simulates the component's ref without React: `pending` plays the role of the
    // `pending` ref in week-selector.tsx, `week` the URL-derived state.
    let pending: number | null = null;
    let week = 4;
    const click = () => {
      const next = stepWeek(pending ?? week, 1);
      if (next === null) return;
      pending = next; // go(next)
    };
    const urlCommits = (confirmed: number) => {
      week = confirmed;
      pending = resolvePendingAfterUrlChange(pending, confirmed);
    };

    click(); // pending=5, replace(5) in flight
    click(); // pending=6, replace(6) in flight (base came from pending, not stale `week`)
    urlCommits(5); // the first replace's URL lands late; must not clobber pending=6
    expect(pending).toBe(6);
    click(); // must step from 6, not from the stale week=5
    expect(pending).toBe(7);

    urlCommits(7); // the real latest replace finally lands
    expect(pending).toBeNull();
  });
});
