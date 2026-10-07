import { TRADE_MAX_PLAYERS_PER_SIDE } from "@sideline/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnalyzerErrorView, AnalyzerResult } from "./analyzer-result";
import { PlayerPicker, type AnalyzerPlayer } from "./analyzer";
import { evaluation, suggestion } from "./fixtures";
import {
  buildEvaluateUrl,
  buildTradesQuery,
  parseIdList,
  parseOther,
  parseTab,
  toggleId,
  TRADE_MAX_PER_SIDE,
  tradesHref,
} from "./format";
import { SuggestionCard } from "./suggestion-card";
import { TradesTabs } from "./tabs";

const card = (s = suggestion(), top = false) =>
  renderToStaticMarkup(
    <SuggestionCard leagueId="L1" suggestion={s} teamName="Team Three" top={top} />,
  );

describe("SuggestionCard", () => {
  it("shows players, deltas, playoff change, fairness text and reasons", () => {
    const html = card();
    expect(html).toContain("Alpha Back");
    expect(html).toContain("Beta Wideout");
    expect(html).toContain("You give");
    expect(html).toContain("You get");
    expect(html).toContain("Your best lineup");
    expect(html).toContain("+8.4 pts");
    expect(html).toContain("+6.1 pts");
    expect(html).toContain("Playoffs 41% to 47%");
    expect(html).toContain('data-testid="trade-fairness"');
    expect(html).toContain(">Fair<");
    expect(html).toContain("Both teams gain about the same");
    expect(html).toContain("With Team Three");
  });

  it("links to the analyzer with the trade prefilled", () => {
    const html = card();
    expect(html).toContain('href="/l/L1/trades?tab=analyzer&amp;other=3&amp;give=p1&amp;get=p2"');
  });

  it("marks only the top suggestion and collapses many reasons", () => {
    expect(card(suggestion(), true)).toContain("trade-top-pick");
    expect(card()).not.toContain("trade-top-pick");
    const many = suggestion({
      reasons: [1, 2, 3, 4].map((n) => ({ code: `R${String(n)}`, label: `Reason ${String(n)}` })),
    });
    expect(card(many)).toContain("trade-reasons-details");
  });
});

describe("analyzer request and selection", () => {
  it("builds the evaluate URL", () => {
    expect(buildEvaluateUrl("L1", { other: 3, give: ["a", "b"], get: ["c"] })).toBe(
      "/api/l/L1/trades/evaluate?other=3&give=a,b&get=c",
    );
  });
  it("returns null for incomplete or oversized selections", () => {
    expect(buildEvaluateUrl("L1", { other: null, give: ["a"], get: ["c"] })).toBeNull();
    expect(buildEvaluateUrl("L1", { other: 3, give: [], get: ["c"] })).toBeNull();
    expect(buildEvaluateUrl("L1", { other: 3, give: ["a", "b", "c", "d"], get: ["c"] })).toBeNull();
  });
  it("caps a side at 3 and allows deselecting", () => {
    expect(TRADE_MAX_PER_SIDE).toBe(TRADE_MAX_PLAYERS_PER_SIDE);
    expect(toggleId(["a", "b", "c"], "d", 3)).toEqual(["a", "b", "c"]);
    expect(toggleId(["a", "b", "c"], "b", 3)).toEqual(["a", "c"]);
    expect(toggleId(["a"], "z", 3)).toEqual(["a", "z"]);
  });
  it("round trips URL state", () => {
    expect(buildTradesQuery("finder")).toBe("");
    expect(tradesHref("L1", "analyzer")).toBe("/l/L1/trades?tab=analyzer");
    expect(parseTab("analyzer")).toBe("analyzer");
    expect(parseTab("x")).toBe("finder");
    expect(parseOther("3")).toBe(3);
    expect(parseOther("0")).toBeNull();
    expect(parseOther("3x")).toBeNull();
    expect(parseIdList("a,b,a,c,d")).toEqual(["a", "b", "c"]);
  });
});

const players: AnalyzerPlayer[] = [
  { playerId: "a", name: "Aa", position: "QB", nflTeam: "KC", slot: "starter" },
  { playerId: "b", name: "Bb", position: "RB", nflTeam: "SF", slot: "ir" },
  { playerId: "c", name: "Cc", position: "WR", nflTeam: "DAL", slot: "taxi" },
  { playerId: "d", name: "Dd", position: "TE", nflTeam: "NE", slot: "bench" },
];

describe("PlayerPicker", () => {
  it("disables unchecked boxes at the cap and marks IR and taxi", () => {
    const html = renderToStaticMarkup(
      <PlayerPicker
        legend="You give"
        players={players}
        selected={["a", "b", "c"]}
        onToggle={() => {}}
        testid="analyzer-give"
      />,
    );
    expect(html).toContain("(3 of 3)");
    expect(html).toContain(">IR<");
    expect(html).toContain(">Taxi<");
    const dBox = html.match(/<input[^>]*data-player-id="d"[^>]*>/)?.[0] ?? "";
    expect(dBox).toContain("disabled");
    const bBox = html.match(/<input[^>]*data-player-id="b"[^>]*>/)?.[0] ?? "";
    expect(bBox).not.toContain("disabled");
  });
});

describe("AnalyzerResult", () => {
  it("renders both teams, drops, offseason playoff reason and fairness", () => {
    const html = renderToStaticMarkup(
      <AnalyzerResult result={evaluation()} theirTeamName="Team Three" />,
    );
    expect(html).toContain('data-testid="analyzer-result"');
    expect(html).toContain("Playoffs 41% to 47%");
    expect(html).toContain("Playoff odds are not available in the offseason.");
    expect(html).toContain("They drop Gamma Tight to make room.");
    expect(html).toContain(">Fair<");
    expect(html).toContain("Team Three");
    expect(html).not.toContain("—");
  });
  it("renders an inline error in plain words", () => {
    const html = renderToStaticMarkup(
      <AnalyzerErrorView message="Pick another team to trade with." />,
    );
    expect(html).toContain('data-testid="analyzer-error"');
    expect(html).toContain("Pick another team to trade with.");
  });
});

describe("TradesTabs", () => {
  it("marks the current tab", () => {
    const html = renderToStaticMarkup(<TradesTabs leagueId="L1" tab="analyzer" />);
    const a = html.match(/<a [^>]*trades-tab-analyzer[^>]*>/)?.[0] ?? "";
    expect(a).toContain('aria-current="page"');
    expect(html.match(/aria-current/g)).toHaveLength(1);
    expect(html).toContain('href="/l/L1/trades"');
  });
});
