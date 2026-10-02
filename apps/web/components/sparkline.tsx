import { cn } from "../lib/client/cn";
import { buildSparkline } from "./sparkline-path";

export interface SparklineProps {
  /** Values by period. Null leaves a gap. */
  values: ReadonlyArray<number | null>;
  /** Labels for each point in the data table (for example "Wk 1"). Defaults to 1, 2, 3. */
  labels?: ReadonlyArray<string>;
  /** Dashed reference line, such as a projection or average. */
  reference?: number | null;
  referenceLabel?: string;
  width?: number;
  height?: number;
  /** Show the latest value next to the line. Default true. */
  showValue?: boolean;
  /** Accessible name, also used as the table caption. */
  label: string;
  className?: string;
}

export function Sparkline({
  values,
  labels,
  reference,
  referenceLabel = "Reference",
  width = 96,
  height = 32,
  showValue = true,
  label,
  className,
}: SparklineProps) {
  const g = buildSparkline(values, width, height, reference);
  const last = g.points[g.points.length - 1];
  const hasTrend = g.points.length >= 2;
  return (
    <span className={cn("inline-flex items-center gap-2", className)} data-testid="sparkline">
      {hasTrend ? (
        <svg
          role="img"
          aria-label={label}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="shrink-0 overflow-visible text-accent"
        >
          {g.referenceY !== null ? (
            <line
              x1={0}
              x2={width}
              y1={g.referenceY}
              y2={g.referenceY}
              stroke="currentColor"
              strokeOpacity={0.4}
              strokeDasharray="3 3"
              className="text-muted-foreground"
            />
          ) : null}
          {g.path ? (
            <path
              d={g.path}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
          {last ? <circle cx={last.x} cy={last.y} r={3} fill="currentColor" /> : null}
        </svg>
      ) : (
        <span className="text-sm text-muted-foreground" data-testid="sparkline-empty">
          No trend yet
        </span>
      )}
      {hasTrend && showValue && last ? (
        <span className="text-sm font-medium tabular-nums" data-testid="sparkline-value">
          {last.value}
        </span>
      ) : null}
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {values.map((v, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static ordered series
            <tr key={i}>
              <th scope="row">{labels?.[i] ?? String(i + 1)}</th>
              <td>{v === null ? "No data" : v}</td>
            </tr>
          ))}
          {reference !== undefined && reference !== null ? (
            <tr>
              <th scope="row">{referenceLabel}</th>
              <td>{reference}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </span>
  );
}
