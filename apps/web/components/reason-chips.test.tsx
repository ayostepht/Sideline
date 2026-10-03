import type { Reason } from "@sideline/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReasonChip, ReasonChips } from "./reason-chips";

const base: Reason = { code: "USAGE_UP", label: "Usage trending up", impact: 1.2 };

describe("ReasonChip / projectedPoints", () => {
  it("renders identically when projectedPoints is absent, with or without the key present", () => {
    const withoutKey = renderToStaticMarkup(<ReasonChip reason={base} />);
    const withUndefinedKey = renderToStaticMarkup(
      <ReasonChip reason={{ ...base, projectedPoints: undefined }} />,
    );
    expect(withUndefinedKey).toBe(withoutKey);
    expect(withoutKey).not.toContain("proj pts");
  });

  it("renders the formatted projected points text when present", () => {
    const html = renderToStaticMarkup(<ReasonChip reason={{ ...base, projectedPoints: 18.42 }} />);
    expect(html).toContain("18.4 proj pts");
  });

  it("ReasonChips list is unchanged for reasons without projectedPoints", () => {
    const reasons: Reason[] = [base, { code: "MATCHUP", label: "Favorable matchup" }];
    const before = renderToStaticMarkup(<ReasonChips reasons={reasons} />);
    const sameButExplicitUndefined = renderToStaticMarkup(
      <ReasonChips reasons={reasons.map((r) => ({ ...r, projectedPoints: undefined }))} />,
    );
    expect(sameButExplicitUndefined).toBe(before);
  });
});

describe("ReasonChip / long label wrapping", () => {
  const longLabel = "Questionable, so we lowered their projection slightly";

  it("renders the full label text without truncating it", () => {
    const html = renderToStaticMarkup(
      <ReasonChip reason={{ code: "INJURY", label: longLabel, projectedPoints: 9.3 }} />,
    );
    expect(html).toContain(longLabel);
    expect(html).not.toContain("truncate");
    expect(html).not.toContain(`title="${longLabel}"`);
  });

  it("wraps the label with break-words instead of a single-line ellipsis", () => {
    const html = renderToStaticMarkup(<ReasonChip reason={{ ...base, label: longLabel }} />);
    expect(html).toContain("break-words");
  });
});
