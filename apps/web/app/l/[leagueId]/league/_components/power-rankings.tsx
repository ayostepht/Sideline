import type { LeagueIntelligenceTeam } from "@sideline/shared";
import { POWER_SCORE_WEIGHTS } from "@sideline/core";
import { ReasonChips } from "../../../../../components/reason-chips";
import { WhySheet } from "../../../../../components/why-sheet";
import { formatPowerScore, sortByPowerScoreDesc } from "./format";

/**
 * LEAGUE-3 UI: teams ranked by the composite power score, highest first. The three component
 * weights (`POWER_SCORE_WEIGHTS` from `@sideline/core`, 40/30/30, PLAN 5.8) are shown once as a
 * plain-language blurb above the list rather than repeated per row, then the per-team breakdown
 * (same three components, already weighted) is available in each row's Why sheet.
 */
export function PowerRankingsList({ teams }: { teams: readonly LeagueIntelligenceTeam[] }) {
  const ranked = sortByPowerScoreDesc(teams);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        Weighted: {Math.round(POWER_SCORE_WEIGHTS.allPlay * 100)}% all-play win rate,{" "}
        {Math.round(POWER_SCORE_WEIGHTS.recentPointsFor * 100)}% recent points for,{" "}
        {Math.round(POWER_SCORE_WEIGHTS.rosterStrength * 100)}% roster strength.
      </p>
      <ol
        className="flex flex-col divide-y rounded-card border bg-card"
        data-testid="power-rankings-list"
      >
        {ranked.map((team, i) => (
          <li
            key={team.rosterId}
            className="flex flex-col gap-1 px-3 py-2"
            data-testid="power-rankings-row"
          >
            <div className="flex items-center gap-2">
              <span className="w-6 shrink-0 text-center text-sm font-bold tabular-nums">
                <span className="sr-only">Rank </span>
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate font-bold" title={team.teamName}>
                {team.teamName}
              </span>
              <span className="shrink-0 text-right text-lg font-bold tabular-nums">
                {formatPowerScore(team.powerScore.score)}
                <span className="ml-1 text-xs font-normal text-muted-foreground">/100</span>
              </span>
            </div>
            <ReasonChips
              reasons={team.powerScore.reasons}
              max={2}
              trailing={
                <WhySheet
                  title={`${team.teamName}: power score`}
                  summary={{
                    label: "Power score",
                    value: `${formatPowerScore(team.powerScore.score)}/100`,
                  }}
                  reasons={team.powerScore.reasons}
                />
              }
            />
          </li>
        ))}
      </ol>
    </div>
  );
}
