import { describe, expect, it } from "vitest";
import { INJURY_KEYS, injuryInfo, normalizeInjury } from "./injury";

describe("normalizeInjury", () => {
  it("maps each status to full words", () => {
    expect(normalizeInjury("Questionable")?.full).toBe("Questionable");
    expect(normalizeInjury("IR")?.key).toBe("ir");
    expect(normalizeInjury("PUP")?.key).toBe("pup");
    expect(normalizeInjury("Sus")?.key).toBe("suspended");
    expect(normalizeInjury("NA")?.key).toBe("na");
    expect(normalizeInjury("Injured Reserve")?.key).toBe("ir");
  });
  it("returns null for healthy or unknown", () => {
    expect(normalizeInjury(null)).toBeNull();
    expect(normalizeInjury("")).toBeNull();
    expect(normalizeInjury("Healthy")).toBeNull();
  });
  it("every key has text and a tone", () => {
    for (const k of INJURY_KEYS) {
      const i = injuryInfo(k);
      expect(i.short.length).toBeGreaterThan(0);
      expect(i.full.length).toBeGreaterThan(0);
    }
  });
});
