/** Plain-text rendering of a {@link ValidationReport} (SCORE-2), for the CLI and for saved reports. */
import type { ValidationReport } from "./validate.js";

function pct(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

function weekRanges(weeks: readonly number[]): string {
  if (weeks.length === 0) return "(none)";
  return weeks.join(", ");
}

export function renderReport(report: ValidationReport): string {
  const lines: string[] = [];
  lines.push(`Scoring validation: league ${report.leagueId}, season ${report.season}`);
  lines.push(
    `Weeks checked: ${weekRanges(report.weeksChecked)} (${report.weeksChecked.length} weeks)`,
  );
  lines.push(`Player-weeks checked: ${report.totalPlayerWeeks}`);
  lines.push(`Matches (diff <= 0.01): ${report.matchCount}`);
  lines.push(`Match rate: ${pct(report.matchRate)}`);

  if (report.mismatchCount > 0) {
    lines.push("");
    const shown = report.mismatches.length;
    const suffix =
      shown < report.mismatchCount ? ` (showing first ${shown} of ${report.mismatchCount})` : "";
    lines.push(`Mismatches${suffix}:`);
    lines.push("playerId\tweek\texpected\tcomputed\tdiff");
    for (const m of report.mismatches) {
      lines.push(`${m.playerId}\t${m.week}\t${m.expected}\t${m.computed}\t${m.diff.toFixed(4)}`);
    }
    if (report.suspectStatKeys.length > 0) {
      lines.push("");
      lines.push("Suspect stat keys (scoring keys missing from a mismatched player's stats row):");
      for (const s of report.suspectStatKeys) {
        lines.push(`  ${s.key}: ${s.count}`);
      }
    }
  } else if (report.totalPlayerWeeks === 0) {
    lines.push("");
    lines.push("No player-weeks found for the given weeks; nothing was validated.");
  }

  return lines.join("\n");
}
