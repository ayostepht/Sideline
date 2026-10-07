import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MODE_STAT_LABEL } from "./format";
import { ModeToggle } from "./mode-toggle";

describe("ModeToggle", () => {
  it("renders four options in order with Auto selected for auto", () => {
    const html = renderToStaticMarkup(<ModeToggle leagueId="L" week={5} mode="auto" />);
    const ids = [...html.matchAll(/data-testid="lineup-mode-toggle-(\w+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(["auto", "projected", "safe", "upside"]);
    const auto = html.match(/<a [^>]*lineup-mode-toggle-auto[^>]*>/)?.[0] ?? "";
    expect(auto).toContain('aria-current="true"');
    expect(html.match(/aria-current/g)).toHaveLength(1);
  });

  it("shows a hint and a 44px info button when Auto has no reason", () => {
    const html = renderToStaticMarkup(<ModeToggle leagueId="L" week={5} mode="auto" />);
    expect(html).toContain("Auto picks your mode from your win odds.");
    const info = html.match(/<button [^>]*lineup-auto-info[^>]*>/)?.[0] ?? "";
    expect(info).toContain('aria-label="What does Auto do?"');
    expect(info).toContain("size-11");
    expect(html).not.toContain("title=");
    const safe = renderToStaticMarkup(<ModeToggle leagueId="L" week={5} mode="safe" />);
    expect(safe).not.toContain("lineup-auto-hint");
    expect(html).toContain("min-h-11");
  });

  it("renders the reason line only when a reason is given", () => {
    const none = renderToStaticMarkup(<ModeToggle leagueId="L" week={5} mode="auto" />);
    expect(none).not.toContain("lineup-auto-reason");
    const some = renderToStaticMarkup(
      <ModeToggle
        leagueId="L"
        week={5}
        mode="auto"
        reason={{ code: "AUTO_MODE", label: "Auto picked Upside: 28% to win", value: 0.28 }}
      />,
    );
    expect(some).toContain('data-testid="lineup-auto-reason"');
    expect(some).toContain("Auto picked Upside: 28% to win");
  });
});

describe("stat label", () => {
  it("follows the resolved mode", () => {
    expect(MODE_STAT_LABEL.upside).toBe("Upside pts");
  });
});
