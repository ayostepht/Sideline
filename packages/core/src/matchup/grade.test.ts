import { describe, expect, it } from "vitest";
import { matchupGrade } from "./grade.js";

// Quintile boundaries for totalTeams = 32, using quintile = min(4, floor(((rank-1)/32)*5)):
// rank 1-7   -> quintile 0 -> A   (floor(5*0/32)=0 .. floor(5*6/32)=0)
// rank 8-13  -> quintile 1 -> B   (floor(5*7/32)=1 .. floor(5*12/32)=1)
// rank 14-20 -> quintile 2 -> C   (floor(5*13/32)=2 .. floor(5*19/32)=2)
// rank 21-26 -> quintile 3 -> D   (floor(5*20/32)=3 .. floor(5*25/32)=3)
// rank 27-32 -> quintile 4 -> F   (floor(5*26/32)=4 .. floor(5*31/32)=4)
describe("matchupGrade (MATCH-4)", () => {
  it("rank 1 of 32 (allows the most points at the position) is A", () => {
    expect(matchupGrade(1, 32)).toEqual({ grade: "A", label: "Great matchup" });
  });

  it("rank 32 of 32 (allows the fewest points) is F", () => {
    expect(matchupGrade(32, 32)).toEqual({ grade: "F", label: "Toughest matchup" });
  });

  it("rank 7 of 32 is still A, rank 8 of 32 crosses into B (off-by-one at the boundary)", () => {
    expect(matchupGrade(7, 32).grade).toBe("A");
    expect(matchupGrade(8, 32).grade).toBe("B");
  });

  it("rank 13 of 32 is B, rank 14 of 32 crosses into C", () => {
    expect(matchupGrade(13, 32).grade).toBe("B");
    expect(matchupGrade(14, 32).grade).toBe("C");
  });

  it("rank 20 of 32 is C, rank 21 of 32 crosses into D", () => {
    expect(matchupGrade(20, 32).grade).toBe("C");
    expect(matchupGrade(21, 32).grade).toBe("D");
  });

  it("rank 26 of 32 is D, rank 27 of 32 crosses into F", () => {
    expect(matchupGrade(26, 32).grade).toBe("D");
    expect(matchupGrade(27, 32).grade).toBe("F");
  });

  it("every grade carries a short plain-language label", () => {
    for (const rank of [1, 8, 14, 21, 27]) {
      const result = matchupGrade(rank, 32);
      expect(result.label.length).toBeGreaterThan(0);
      expect(result.label).not.toContain("—"); // no em dash per CLAUDE.md section 8
    }
  });
});
