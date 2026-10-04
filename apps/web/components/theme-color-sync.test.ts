import { describe, expect, it } from "vitest";
import { resolveThemeColor } from "./theme-color-sync";

describe("resolveThemeColor", () => {
  it("maps the light resolved theme to the light ground color", () => {
    expect(resolveThemeColor("light")).toBe("#ffffff");
  });

  it("maps the dark resolved theme to the dark ground color", () => {
    expect(resolveThemeColor("dark")).toBe("#2a2a2a");
  });

  it("returns undefined for an unresolved theme so callers leave the meta tag alone", () => {
    expect(resolveThemeColor(undefined)).toBeUndefined();
  });

  it("returns undefined for any other value (defensive against future theme names)", () => {
    expect(resolveThemeColor("system")).toBeUndefined();
    expect(resolveThemeColor("solarized")).toBeUndefined();
  });
});
