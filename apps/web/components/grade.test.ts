import { describe, expect, it } from "vitest";
import { gradeFromScore, gradeLabel, gradeTone } from "./grade";

describe("grade", () => {
  it("labels with text", () => {
    expect(gradeLabel("B")).toBe("B, good matchup");
    expect(gradeLabel("F")).toBe("F, very tough matchup");
  });
  it("maps tone", () => {
    expect(gradeTone("A")).toBe("positive");
    expect(gradeTone("C")).toBe("neutral");
    expect(gradeTone("D")).toBe("negative");
  });
  it("maps score to grade at boundaries", () => {
    expect(gradeFromScore(100)).toBe("A");
    expect(gradeFromScore(80)).toBe("A");
    expect(gradeFromScore(79.9)).toBe("B");
    expect(gradeFromScore(40)).toBe("C");
    expect(gradeFromScore(20)).toBe("D");
    expect(gradeFromScore(0)).toBe("F");
  });
});
