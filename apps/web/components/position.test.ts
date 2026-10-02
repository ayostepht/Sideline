import { describe, expect, it } from "vitest";
import { normalizePosition, positionClass, POSITION_KEYS } from "./position";

describe("normalizePosition", () => {
  it("keeps known positions", () => {
    for (const k of POSITION_KEYS) expect(normalizePosition(k)).toBe(k);
  });
  it("maps aliases and case", () => {
    expect(normalizePosition("dst")).toBe("DEF");
    expect(normalizePosition("CB")).toBe("DB");
    expect(normalizePosition(" olb ")).toBe("LB");
    expect(normalizePosition("DE")).toBe("DL");
  });
  it("falls back to FLEX", () => {
    expect(normalizePosition(null)).toBe("FLEX");
    expect(normalizePosition("")).toBe("FLEX");
    expect(normalizePosition("SUPER_FLEX")).toBe("FLEX");
  });
  it("has a distinct class per position", () => {
    const classes = POSITION_KEYS.map(positionClass);
    expect(new Set(classes).size).toBe(POSITION_KEYS.length);
  });
});
