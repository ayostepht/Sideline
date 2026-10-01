import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./index.js";

describe("@sideline/sleeper", () => {
  it("exports its package name", () => {
    expect(PACKAGE_NAME).toBe("@sideline/sleeper");
  });
});
