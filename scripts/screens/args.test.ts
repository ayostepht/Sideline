import { describe, expect, it } from "vitest";
import { parseScreensArgs, routeSlug, screenshotPath, ScreensArgError } from "./args.js";

describe("screens args", () => {
  it("parses --routes and leaves routes undefined when absent", () => {
    expect(parseScreensArgs(["--routes=/a, /b/c"]).routes).toEqual(["/a", "/b/c"]);
    expect(parseScreensArgs([]).routes).toBeUndefined();
  });

  it("rejects bad input", () => {
    expect(() => parseScreensArgs(["--routes="])).toThrow(ScreensArgError);
    expect(() => parseScreensArgs(["--routes=lineup"])).toThrow(/must start with/);
    expect(() => parseScreensArgs(["--wat"])).toThrow(ScreensArgError);
  });

  it("gives query-string variants distinct filesystem-safe slugs", () => {
    const slugs = ["why", "sheet", "dialog"].map((v) => routeSlug(`/dev/gallery?open=${v}`));
    expect(new Set(slugs).size).toBe(3);
    expect(slugs[0]).toBe("dev-gallery__open-why");
    for (const s of slugs) expect(s).toMatch(/^[a-zA-Z0-9._-]+$/);
    expect(routeSlug("/a?b=../../x")).not.toContain("/");
  });

  it("builds slugs and output paths", () => {
    expect(routeSlug("/")).toBe("home");
    expect(routeSlug("/lineup/week-3?x=1")).toBe("lineup-week-3__x-1");
    expect(routeSlug("/dev/gallery")).toBe("dev-gallery");
    expect(routeSlug("/dev/gallery#top")).toBe("dev-gallery");
    expect(screenshotPath("/r", "/", 390, "dark")).toBe("/r/.screens/home/390-dark.png");
  });
});
