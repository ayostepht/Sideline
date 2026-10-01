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

  it("builds slugs and output paths", () => {
    expect(routeSlug("/")).toBe("home");
    expect(routeSlug("/lineup/week-3?x=1")).toBe("lineup-week-3");
    expect(screenshotPath("/r", "/", 390, "dark")).toBe("/r/.screens/home/390-dark.png");
  });
});
