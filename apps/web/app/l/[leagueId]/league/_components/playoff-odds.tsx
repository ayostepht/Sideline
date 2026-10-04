import type { LeagueIntelligenceTeam } from "@sideline/shared";
import { ReasonChips } from "../../../../../components/reason-chips";
import { formatRatePercent } from "./format";

type TeamWithOdds = LeagueIntelligenceTeam & {
  playoffOdds: NonNullable<LeagueIntelligenceTeam["playoffOdds"]>;
};

function hasOdds(team: LeagueIntelligenceTeam): team is TeamWithOdds {
  return team.playoffOdds !== null;
}

/**
 * LEAGUE-5 UI: each team's Monte Carlo playoff percentage, highest first. `playoffOdds` is `null`
 * for every team at once exactly when `playoffTeams` is unknown or out of range (the data
 * function's own doc, trusted over its slightly imprecise comment) -- handled here as one
 * explanatory panel rather than per-team blanks (AC3). `reasons` on `playoffOdds` is a season-level
 * signal identical across every team (e.g. "no remaining games"), so it is shown once, not per row.
 */
export function PlayoffOddsSection({
  teams,
  playoffTeams,
}: {
  teams: readonly LeagueIntelligenceTeam[];
  playoffTeams: number | null;
}) {
  const withOdds = teams.filter(hasOdds);
  if (withOdds.length === 0) {
    return (
      <div
        className="rounded-card border bg-card p-3 text-sm text-muted-foreground"
        data-testid="playoff-odds-unavailable"
      >
        {playoffTeams === null
          ? "Playoff odds aren't available yet. This league's playoff spot count hasn't synced."
          : "Playoff odds aren't available for this league's playoff spot count."}
      </div>
    );
  }

  const sorted = [...withOdds].sort((a, b) => b.playoffOdds.playoffPct - a.playoffOdds.playoffPct);
  const seasonReasons = sorted[0]?.playoffOdds.reasons ?? [];

  return (
    <div className="flex flex-col gap-2">
      <ReasonChips reasons={seasonReasons} />
      <ol
        className="flex flex-col divide-y rounded-card border bg-card"
        data-testid="playoff-odds-list"
      >
        {sorted.map((team) => (
          <li
            key={team.rosterId}
            className="flex flex-col gap-1 px-3 py-2"
            data-testid="playoff-odds-row"
          >
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-bold" title={team.teamName}>
                {team.teamName}
              </span>
              <span className="shrink-0 text-right text-lg font-bold tabular-nums">
                {formatRatePercent(team.playoffOdds.playoffPct)}
              </span>
              {team.playoffOdds.byePct !== null ? (
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                  {formatRatePercent(team.playoffOdds.byePct)} bye
                </span>
              ) : null}
            </div>
            {team.playoffOdds.seedDistribution.length > 0 ? (
              <details className="text-sm">
                <summary className="min-h-11 cursor-pointer select-none py-1 font-medium text-link">
                  Seed chances
                </summary>
                <table className="mt-1 w-full max-w-xs text-sm" data-testid="playoff-odds-seeds">
                  <caption className="sr-only">{team.teamName} playoff seed probabilities</caption>
                  <thead>
                    <tr>
                      <th scope="col" className="sl-label text-left">
                        Seed
                      </th>
                      <th scope="col" className="sl-label text-right">
                        Chance
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.playoffOdds.seedDistribution.map((s) => (
                      <tr key={s.seed}>
                        <td className="tabular-nums">{s.seed}</td>
                        <td className="text-right tabular-nums">
                          {formatRatePercent(s.probability)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
