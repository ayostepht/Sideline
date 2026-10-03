/**
 * MATCH-4 (PLAN 5.3): display grade A to F from quintiles of DvP rank. `rank` is 1-indexed, where
 * rank 1 means this defense allows the *most* points at the position (the easiest matchup for an
 * offensive player at that position) and `totalTeams` ranked worst-allows-most to best-allows-least.
 *
 *   quintile = min(4, floor(((rank - 1) / totalTeams) * 5))   // 0 -> A ... 4 -> F
 *
 * The caller already has the underlying DvP number to display alongside the grade (PLAN 5.3); this
 * module only returns the letter grade and a short plain-language label.
 */

export type MatchupGradeLetter = "A" | "B" | "C" | "D" | "F";

export interface MatchupGradeResult {
  grade: MatchupGradeLetter;
  label: string;
}

const GRADE_LABELS: Record<MatchupGradeLetter, string> = {
  A: "Great matchup",
  B: "Good matchup",
  C: "Average matchup",
  D: "Tough matchup",
  F: "Toughest matchup",
};

const GRADE_LETTERS: readonly MatchupGradeLetter[] = ["A", "B", "C", "D", "F"];

export function matchupGrade(rank: number, totalTeams: number): MatchupGradeResult {
  const quintile = Math.min(4, Math.floor(((rank - 1) / totalTeams) * 5));
  const grade = GRADE_LETTERS[quintile] ?? "F";
  return { grade, label: GRADE_LABELS[grade] };
}
