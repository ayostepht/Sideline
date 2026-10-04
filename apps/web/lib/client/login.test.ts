import { describe, expect, it } from "vitest";
import { validatePassword } from "./login";

describe("validatePassword", () => {
  it("rejects an empty password", () => {
    expect(validatePassword("")).not.toBeNull();
  });
  it("rejects a password over 256 characters", () => {
    expect(validatePassword("a".repeat(257))).not.toBeNull();
  });
  it("accepts anything in between, including a 256 char password", () => {
    expect(validatePassword("x")).toBeNull();
    expect(validatePassword("a".repeat(256))).toBeNull();
  });
});
