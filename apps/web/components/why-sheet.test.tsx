import type { Reason } from "@sideline/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WhyBody } from "./why-sheet";

const base: Reason = { code: "USAGE_UP", label: "Usage trending up", impact: 1.2 };

describe("WhyBody / projectedPoints", () => {
  it("renders identically when projectedPoints is absent, with or without the key present", () => {
    const reasons: Reason[] = [base, { code: "MATCHUP", label: "Favorable matchup", value: 3 }];
    const before = renderToStaticMarkup(
      <WhyBody summary={{ label: "Proj", value: "12.3" }} reasons={reasons} />,
    );
    const sameButExplicitUndefined = renderToStaticMarkup(
      <WhyBody
        summary={{ label: "Proj", value: "12.3" }}
        reasons={reasons.map((r) => ({ ...r, projectedPoints: undefined }))}
      />,
    );
    expect(sameButExplicitUndefined).toBe(before);
    expect(before).not.toContain("proj pts");
  });

  it("renders the formatted projected points text when present", () => {
    const html = renderToStaticMarkup(<WhyBody reasons={[{ ...base, projectedPoints: 18.42 }]} />);
    expect(html).toContain("18.4 proj pts");
  });
});

describe("WhyBody / value rounding", () => {
  it("rounds a raw float value to one decimal", () => {
    const html = renderToStaticMarkup(<WhyBody reasons={[{ ...base, value: 89.1891891891892 }]} />);
    expect(html).toContain("89.2");
    expect(html).not.toContain("89.1891891891892");
  });

  it("renders a string value unchanged", () => {
    const html = renderToStaticMarkup(<WhyBody reasons={[{ ...base, value: "4046692" }]} />);
    expect(html).toContain(">4046692<");
  });
});
