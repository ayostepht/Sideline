/** Markdown rendering of a {@link BacktestReport} (MATCH-3), for the CLI and for saved reports
 * under `docs/backtests/`. */
import type { BacktestReport } from "./backtest.js";

function pct(n: number): string {
  return `${n.toFixed(2)}%`;
}

function num(n: number): string {
  return n.toFixed(4);
}

function weekList(weeks: BacktestReport["weeksRequested"]): string {
  if (weeks.length === 0) return "(none)";
  return weeks.map((w) => `${w.season}/${w.seasonType} wk${w.week}`).join(", ");
}

export interface RenderReportOptions {
  /** Heading override, for example to label a fixture-only mechanics smoke test. */
  title?: string;
}

/**
 * Renders a {@link BacktestReport} as markdown, including both standing caveats PLAN 5.3 and
 * ADR-002 item 4 require on every backtest report regardless of outcome.
 */
export function renderReport(report: BacktestReport, opts?: RenderReportOptions): string {
  const lines: string[] = [];
  lines.push(`# ${opts?.title ?? "Matchup adjustment backtest (MATCH-3)"}`);
  lines.push("");
  lines.push(`League: ${report.leagueId}`);
  lines.push(`Weeks requested: ${weekList(report.weeksRequested)}`);
  lines.push(
    `Weeks eligible (regular season, week >= MIN_BACKTEST_WEEK): ${weekList(report.weeksEligible)}`,
  );
  lines.push(`Player-weeks tested: ${report.playerWeeksTested}`);
  lines.push("");

  lines.push("## Grid search (alpha x beta, MAE / Spearman)");
  lines.push("");
  lines.push("| alpha | beta | MAE | Spearman |");
  lines.push("| --- | --- | --- | --- |");
  for (const g of report.grid) {
    lines.push(`| ${g.alpha} | ${g.beta} | ${num(g.mae)} | ${num(g.spearman)} |`);
  }
  lines.push("");

  lines.push("## Baseline vs best");
  lines.push("");
  lines.push(
    `Baseline (raw projections, alpha = 0, beta = 0): MAE ${num(report.baseline.mae)}, Spearman ${num(report.baseline.spearman)}`,
  );
  lines.push(
    `Best grid point: alpha = ${report.best.alpha}, beta = ${report.best.beta}, MAE ${num(report.best.mae)}, Spearman ${num(report.best.spearman)}`,
  );
  lines.push(`MAE improvement over baseline: ${pct(report.maeImprovementPct)}`);
  lines.push("");

  lines.push("## Decision");
  lines.push("");
  if (report.decision === "ship") {
    lines.push(
      `**ship** alpha = ${report.best.alpha}, beta = ${report.best.beta} (MAE improved by ${pct(report.maeImprovementPct)}, at or above the 1% MATCH-3 bar).`,
    );
  } else {
    lines.push(
      `**raw_only**: alpha = 0, beta = 0 stays the default (MAE improvement was ${pct(report.maeImprovementPct)}, below the 1% MATCH-3 bar). Matchup grades are shown as context only; they do not adjust the projection.`,
    );
  }
  lines.push("");

  lines.push("## Caveats");
  lines.push("");
  lines.push(
    "- Double-counting risk (PLAN 5.3): Sleeper's own projections likely already price in some matchup effect. Any 'improvement' found here could partly be this harness correcting Sleeper's own adjustment back toward raw stats rather than adding genuinely new information; a shipped alpha/beta should be re-checked after a schedule shift (bye weeks, playoff seeding) before trusting it long term.",
  );
  lines.push(
    "- 2025 projections caveat (ADR-002 item 4): 2025 weekly projections are probably closing (last pre-game) values, which can be slightly more accurate than the early-week projections a live matchup adjustment would actually see in 2026. A backtest run against 2025 data alone may overstate how much a real-time adjustment would help.",
  );
  lines.push(
    "- beta (the optional implied-team-total term) has no effect in this harness: no implied-team-total (Vegas line) data source exists yet, so every beta value ties for a given alpha. The decision above is driven entirely by alpha.",
  );

  return lines.join("\n");
}
