export type Grade = "A" | "B" | "C" | "D" | "F";
export type GradeTone = "positive" | "neutral" | "negative";

export const GRADE_LABEL: Record<Grade, string> = {
  A: "great matchup",
  B: "good matchup",
  C: "average matchup",
  D: "tough matchup",
  F: "very tough matchup",
};

export function gradeLabel(grade: Grade): string {
  return `${grade}, ${GRADE_LABEL[grade]}`;
}

export function gradeTone(grade: Grade): GradeTone {
  if (grade === "A" || grade === "B") return "positive";
  if (grade === "C") return "neutral";
  return "negative";
}

/** Converts a 0 to 100 matchup score (higher is better for the player) into a letter grade. */
export function gradeFromScore(score: number): Grade {
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  if (score >= 20) return "D";
  return "F";
}
