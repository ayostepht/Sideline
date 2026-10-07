import type { PlayerNewsItem } from "@sideline/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
  useParams: () => ({ leagueId: "L1" }),
}));

import { LatestNote, NewsSection } from "./news-section";

const NOW = "2026-10-07T12:00:00Z";
const note = (over: Partial<PlayerNewsItem> = {}): PlayerNewsItem => ({
  id: "n1",
  kind: "note",
  headline: "Hill (knee) practiced in full Wednesday.",
  summary: "Hill looks set to play. Fire him up as a WR2.",
  url: null,
  source: "RotoWire",
  publishedAt: "2026-10-07T10:00:00Z",
  ...over,
});
const article = (over: Partial<PlayerNewsItem> = {}): PlayerNewsItem => ({
  id: "a1",
  kind: "article",
  headline: "Dolphins preview",
  summary: "Short description.",
  url: "https://espn.com/a1",
  source: "ESPN",
  publishedAt: "2026-10-06T10:00:00Z",
  ...over,
});
const render = (items: PlayerNewsItem[]) =>
  renderToStaticMarkup(
    <NewsSection playerId="p1" nowIso={NOW} news={{ items, lastFetchedAt: NOW }} />,
  );

describe("NewsSection", () => {
  it("shows the latest note before the list", () => {
    const html = render([article(), note()]);
    const latest = html.indexOf('data-testid="player-news-latest"');
    const list = html.indexOf('data-testid="player-news-list"');
    expect(latest).toBeGreaterThan(-1);
    expect(latest).toBeLessThan(list);
    const block = html.slice(latest, list);
    expect(block).toContain("Hill (knee) practiced in full Wednesday.");
    expect(block).toContain("Fire him up as a WR2.");
    expect(html.match(/data-testid="player-news-item"/g)).toHaveLength(1);
  });

  it("renders only the list when there are no notes", () => {
    const html = render([article()]);
    expect(html).not.toContain("player-news-latest");
    expect(html).toContain("player-news-list");
    expect(html).toContain("News from ESPN<");
    expect(html).not.toContain("RotoWire");
  });

  it("uses the combined footer when a note leads", () => {
    expect(render([note()])).toContain("News from ESPN and RotoWire");
  });

  it("shows the empty state", () => {
    expect(render([])).toContain("player-news-empty");
  });
});

describe("LatestNote toggle", () => {
  const long = "Long analysis. ".repeat(40);
  const now = new Date(NOW);

  it("flips aria-expanded for long analysis", () => {
    const collapsed = renderToStaticMarkup(<LatestNote item={note({ summary: long })} now={now} />);
    expect(collapsed).toContain('aria-expanded="false"');
    expect(collapsed).toContain("Show more");
    expect(collapsed).toContain("line-clamp-4");
    const open = renderToStaticMarkup(
      <LatestNote item={note({ summary: long })} now={now} defaultExpanded />,
    );
    expect(open).toContain('aria-expanded="true"');
    expect(open).toContain("Show less");
    expect(open).not.toContain("line-clamp-4");
  });

  it("has no toggle for short analysis", () => {
    const html = renderToStaticMarkup(<LatestNote item={note()} now={now} />);
    expect(html).not.toContain("aria-expanded");
  });

  it("links to ESPN only when a url exists", () => {
    const html = renderToStaticMarkup(
      <LatestNote item={note({ url: "https://espn.com/x" })} now={now} />,
    );
    expect(html).toContain("Read on ESPN");
    expect(html).toContain("(opens in new tab)");
  });
});
