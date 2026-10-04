/**
 * SIM-1 (T5.5a): pure layout for a p10/p50/p90 score-range visualization, in the same
 * dependency-free, hand-rolled-SVG style as `components/sparkline-path.ts`. Every team in `teams`
 * shares one x domain (the min p10 and max p90 across all of them) so their bars are directly
 * comparable on screen, matching `simulateMatchup`'s side-by-side team quantiles.
 */
export interface ScoreRangeBar {
  index: number;
  x10: number;
  x50: number;
  x90: number;
  y: number;
}

export interface ScoreRangeGeometry {
  bars: ScoreRangeBar[];
  width: number;
  height: number;
}

export interface ScoreRangeQuantiles {
  p10: number;
  p50: number;
  p90: number;
}

export function buildScoreRangeGeometry(
  teams: ReadonlyArray<ScoreRangeQuantiles>,
  width: number,
  rowHeight: number,
  pad = 6,
): ScoreRangeGeometry {
  const height = teams.length * rowHeight;
  if (teams.length === 0) return { bars: [], width, height };
  const nums = teams.flatMap((t) => [t.p10, t.p90]).filter((v) => Number.isFinite(v));
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const innerW = Math.max(0, width - pad * 2);
  const xOf = (v: number): number =>
    max === min ? width / 2 : pad + ((v - min) / (max - min)) * innerW;
  const r = (n: number): number => Math.round(n * 100) / 100;
  const bars: ScoreRangeBar[] = teams.map((t, i) => ({
    index: i,
    x10: r(xOf(t.p10)),
    x50: r(xOf(t.p50)),
    x90: r(xOf(t.p90)),
    y: r(i * rowHeight + rowHeight / 2),
  }));
  return { bars, width, height };
}
