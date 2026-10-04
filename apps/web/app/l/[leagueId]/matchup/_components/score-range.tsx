import { cn } from "../../../../../lib/client/cn";
import { buildScoreRangeGeometry } from "./score-range-geometry";

export interface ScoreRangeTeam {
  label: string;
  p10: number;
  p50: number;
  p90: number;
  /** This is the viewer's own team: drawn in the accent color. */
  highlight?: boolean;
}

export interface ScoreRangeProps {
  teams: readonly ScoreRangeTeam[];
  /** Accessible name for the chart and caption for its table alternative. */
  label: string;
  className?: string;
}

const fmt = (n: number): string => n.toFixed(1);

/**
 * SIM-1 (T5.5a): a p10-p90 projected score range per team, sharing one scale so the bars are
 * directly comparable. Hand-rolled SVG, matching `Sparkline`'s dependency-free convention (this
 * codebase has no charting library). The SVG is decorative (`aria-hidden`): every number is also
 * shown as real text in the legend below it and in the screen-reader-only table, so no part of
 * the range is color- or shape-only information.
 */
export function ScoreRange({ teams, label, className }: ScoreRangeProps) {
  const width = 280;
  const rowHeight = 28;
  const geometry = buildScoreRangeGeometry(teams, width, rowHeight);
  return (
    <div className={cn("flex flex-col gap-3", className)} data-testid="score-range">
      <svg
        aria-hidden="true"
        width="100%"
        height={geometry.height}
        viewBox={`0 0 ${width} ${geometry.height}`}
        className="overflow-visible"
      >
        {geometry.bars.map((bar) => {
          const team = teams[bar.index];
          if (!team) return null;
          return (
            <g key={team.label}>
              <line
                x1={bar.x10}
                x2={bar.x90}
                y1={bar.y}
                y2={bar.y}
                strokeWidth={6}
                strokeLinecap="round"
                stroke="currentColor"
                className={team.highlight ? "text-accent-soft" : "text-muted"}
              />
              <circle
                cx={bar.x50}
                cy={bar.y}
                r={5}
                fill="currentColor"
                className={team.highlight ? "text-primary" : "text-muted-foreground"}
              />
            </g>
          );
        })}
      </svg>
      <dl className="flex flex-col gap-1.5" data-testid="score-range-legend">
        {teams.map((team) => (
          <div key={team.label} className="flex items-baseline justify-between gap-2 text-sm">
            <dt className="min-w-0 truncate font-medium">{team.label}</dt>
            <dd className="shrink-0 tabular-nums text-muted-foreground">
              <span className="sr-only">Range </span>
              {fmt(team.p10)}&ndash;{fmt(team.p90)}{" "}
              <span className="font-semibold text-foreground">
                <span className="sr-only">, median </span>
                {fmt(team.p50)}
              </span>
            </dd>
          </div>
        ))}
      </dl>
      {/* [contain:layout]: this table's accessible-name columns ("Low (10th percentile)" etc.)
          are wider than the viewport at 390px. `sr-only` clips the table visually with
          `overflow: hidden`, but without `contain: layout` on a wrapper Chromium still grows
          `document.documentElement.scrollWidth` from the table's unclipped intrinsic content
          width (same mechanism as the positional-strength-grid heatmap table). */}
      <div className="[contain:layout]">
        <table className="sr-only">
          <caption>{label}</caption>
          <thead>
            <tr>
              <th scope="col">Team</th>
              <th scope="col">Low (10th percentile)</th>
              <th scope="col">Median</th>
              <th scope="col">High (90th percentile)</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => (
              <tr key={team.label}>
                <th scope="row">{team.label}</th>
                <td>{fmt(team.p10)}</td>
                <td>{fmt(team.p50)}</td>
                <td>{fmt(team.p90)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
