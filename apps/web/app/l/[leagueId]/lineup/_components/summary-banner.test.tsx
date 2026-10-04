import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LineupSummaryBanner } from "./summary-banner";

describe("LineupSummaryBanner / materiality floor", () => {
  it("shows the already-optimal copy below the 0.05pt floor, even with swaps present", () => {
    const zero = renderToStaticMarkup(<LineupSummaryBanner pointDelta={0} swapCount={3} />);
    const tiny = renderToStaticMarkup(<LineupSummaryBanner pointDelta={0.02} swapCount={3} />);
    expect(zero).toContain("Your lineup is already optimal");
    expect(tiny).toContain("Your lineup is already optimal");
    expect(zero).not.toContain("swaps available");
    expect(tiny).not.toContain("swaps available");
  });

  it("shows the swap count and signed delta at or above the floor", () => {
    const html = renderToStaticMarkup(<LineupSummaryBanner pointDelta={3.4} swapCount={2} />);
    expect(html).toContain("2 swaps available, projected +3.4 pts");
  });
});
