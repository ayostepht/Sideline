import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SeasonStateNotice, seasonStateFor } from "./season-state-notice";

describe("seasonStateFor", () => {
  it("maps pre_draft and drafting to preseason", () => {
    expect(seasonStateFor("pre_draft")).toBe("preseason");
    expect(seasonStateFor("drafting")).toBe("preseason");
  });

  it("maps complete to offseason", () => {
    expect(seasonStateFor("complete")).toBe("offseason");
  });

  it("maps in_season and unrecognized values to null", () => {
    expect(seasonStateFor("in_season")).toBeNull();
    expect(seasonStateFor("some_future_status")).toBeNull();
  });
});

describe("SeasonStateNotice", () => {
  const props = {
    preseasonMessage: "The season has not started. X begins once the first NFL week opens.",
    offseasonMessage: "The season is over. X will be back when the new season starts.",
    testid: "matchup",
  };

  it("renders the preseason message and testid for pre_draft", () => {
    const html = renderToStaticMarkup(<SeasonStateNotice status="pre_draft" {...props} />);
    expect(html).toContain(props.preseasonMessage);
    expect(html).toContain('data-testid="matchup-preseason"');
  });

  it("renders the preseason message and testid for drafting", () => {
    const html = renderToStaticMarkup(<SeasonStateNotice status="drafting" {...props} />);
    expect(html).toContain(props.preseasonMessage);
    expect(html).toContain('data-testid="matchup-preseason"');
  });

  it("renders the offseason message and testid for complete", () => {
    const html = renderToStaticMarkup(<SeasonStateNotice status="complete" {...props} />);
    expect(html).toContain(props.offseasonMessage);
    expect(html).toContain('data-testid="matchup-offseason"');
  });

  it("renders nothing for in_season", () => {
    const html = renderToStaticMarkup(<SeasonStateNotice status="in_season" {...props} />);
    expect(html).toBe("");
  });

  it("renders nothing for an unrecognized status", () => {
    const html = renderToStaticMarkup(<SeasonStateNotice status="something_new" {...props} />);
    expect(html).toBe("");
  });
});
