import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./index.js";

describe("@sideline/providers", () => {
  it("exports its package name", () => {
    expect(PACKAGE_NAME).toBe("@sideline/providers");
  });
});
