import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { cn } from "../lib/client/cn";
import { GRADE_LABEL, gradeTone, type Grade } from "./grade";

const TONE_CLASS = {
  positive: "bg-positive-soft text-positive",
  neutral: "bg-muted text-foreground",
  negative: "bg-negative-soft text-negative",
} as const;

export interface MatchupGradeProps {
  grade: Grade;
  /** Underlying number (e.g. points allowed vs league average). Shown next to the grade. */
  value?: string | number;
  /** Hide the words and keep only grade, icon and number (the full label stays in the accessible name). */
  compact?: boolean;
  className?: string;
}

export function MatchupGrade({ grade, value, compact = false, className }: MatchupGradeProps) {
  const tone = gradeTone(grade);
  const Icon = tone === "positive" ? ArrowUp : tone === "negative" ? ArrowDown : Minus;
  return (
    <span
      data-testid="matchup-grade"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE_CLASS[tone],
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      <span className="font-semibold">{grade}</span>
      <span className={compact ? "sr-only" : undefined}>
        {compact ? ", " : ""}
        {GRADE_LABEL[grade]}
      </span>
      {value !== undefined ? <span className="tabular-nums opacity-90">({value})</span> : null}
    </span>
  );
}
