import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InfoPopover, InfoPopoverFallback } from "./info-popover";
import { PlayerModalPlaceholder } from "./player-modal";
import { WhySheet } from "./why-sheet";
import { WeatherChips } from "./weather";

describe("lazy wrappers before their code loads", () => {
  it("PlayerModal placeholder is an accessible busy dialog", () => {
    const html = renderToStaticMarkup(<PlayerModalPlaceholder label="Josh Allen" />);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="Josh Allen"');
    expect(html).toContain("Loading player");
  });

  it("InfoPopover keeps its trigger inside a stable host with a label", () => {
    const html = renderToStaticMarkup(<InfoPopover label="About X" text="t" testid="x-info" />);
    expect(html).toContain('aria-label="About X"');
    expect(html).toContain('data-testid="x-info"');
    expect(html.startsWith("<span")).toBe(true);
  });

  it("InfoPopover fallback (import failed) is collapsed and exposes aria-expanded", () => {
    const html = renderToStaticMarkup(<InfoPopoverFallback label="About X" text="Hello" />);
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Hello");
  });

  it("WhySheet renders its default trigger before load, inside a layout-neutral host", () => {
    const html = renderToStaticMarkup(<WhySheet title="T" reasons={[]} />);
    expect(html).toContain("Why?");
    expect(html).toContain('class="contents"');
  });
});

describe("WeatherChips keys", () => {
  it("renders duplicate labels without key collisions", () => {
    const chips = [
      { kind: "wind" as const, label: "Wind 20 mph" },
      { kind: "wind" as const, label: "Wind 20 mph" },
    ];
    expect(
      renderToStaticMarkup(<WeatherChips chips={chips} />).match(/data-testid="weather-chip"/g),
    ).toHaveLength(2);
  });
});
