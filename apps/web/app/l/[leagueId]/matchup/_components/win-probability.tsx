import { StatCard } from "../../../../../components/stat-card";
import { cn } from "../../../../../lib/client/cn";

export interface WinProbabilityProps {
  teamName: string;
  teamProbability: number;
  opponentName: string;
  opponentProbability: number;
  tieProbability: number;
  className?: string;
}

function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

/**
 * SIM-1 (T5.5a): this week's head-to-head win probability. Insight first: a plain-English
 * headline leads, then the exact You / opponent / tie breakdown follows as evidence.
 */
export function WinProbability({
  teamName,
  teamProbability,
  opponentName,
  opponentProbability,
  tieProbability,
  className,
}: WinProbabilityProps) {
  return (
    <div className={className} data-testid="matchup-win-probability">
      <div
        className="rounded-control bg-primary px-3 py-2 text-primary-foreground"
        data-testid="matchup-win-probability-banner"
      >
        <p className="text-lg font-bold tabular-nums sm:text-xl">
          You have a {pct(teamProbability)} chance to win against {opponentName}
        </p>
      </div>
      <div
        className={cn("mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3")}
        role="group"
        aria-label="Win probability breakdown"
      >
        <StatCard label="You" value={pct(teamProbability)} sublabel={teamName} />
        <StatCard label="Tie" value={pct(tieProbability)} />
        <StatCard label={opponentName} value={pct(opponentProbability)} />
      </div>
    </div>
  );
}
