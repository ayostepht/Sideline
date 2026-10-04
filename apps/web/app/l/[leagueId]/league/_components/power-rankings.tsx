import type { LeagueIntelligenceTeam } from "@sideline/shared";
import { POWER_SCORE_WEIGHTS } from "@sideline/core";
import { Badge } from "../../../../../components/ui/badge";
import { ReasonChips } from "../../../../../components/reason-chips";
import { WhySheet } from "../../../../../components/why-sheet";
import { formatPowerScore, sortByPowerScoreDesc } from "./format";

function YouBadge() {
  return (
    <Badge variant="you" data-testid="power-rankings-you">
      You
    </Badge>
  );
}

/**
 * LEAGUE-3 UI: teams ranked by the composite power score, highest first. The three component
 * weights (`POWER_SCORE_WEIGHTS` from `@sideline/core`, 40/30/30, PLAN 5.8) are shown once as a
 * plain-language blurb above the list rather than repeated per row, then the per-team breakdown
 * (same three components, already weighted) is available in each row's Why sheet.
 *
 * Mobile shows one card per team (unchanged); `lg` and up additionally shows a denser `<table>`
 * (T6.3c), matching the house convention in `standings.tsx`/`positional-strength-grid.tsx`. Both
 * exist in the DOM at every width; CSS hides one. `myRosterId` (the signed-in user's roster id in
 * this league) marks the viewer's own row with the same badge-plus-tint treatment `standings.tsx`
 * uses.
 */
export function PowerRankingsList({
  teams,
  myRosterId = null,
}: {
  teams: readonly LeagueIntelligenceTeam[];
  myRosterId?: number | null;
}) {
  const ranked = sortByPowerScoreDesc(teams);
  const isMine = (rosterId: number) => myRosterId !== null && rosterId === myRosterId;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        Weighted: {Math.round(POWER_SCORE_WEIGHTS.allPlay * 100)}% all-play win rate,{" "}
        {Math.round(POWER_SCORE_WEIGHTS.recentPointsFor * 100)}% recent points for,{" "}
        {Math.round(POWER_SCORE_WEIGHTS.rosterStrength * 100)}% roster strength.
      </p>
      <ol
        className="flex flex-col divide-y rounded-card border bg-card lg:hidden"
        data-testid="power-rankings-list"
      >
        {ranked.map((team, i) => {
          const mine = isMine(team.rosterId);
          return (
            <li
              key={team.rosterId}
              className={`flex flex-col gap-1 px-3 py-2 ${
                mine ? "bg-accent-soft shadow-[inset_3px_0_0_var(--highlight)]" : ""
              }`}
              data-testid="power-rankings-row"
              data-mine={mine ? "true" : undefined}
            >
              <div className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-center text-sm font-bold tabular-nums">
                  <span className="sr-only">Rank </span>
                  {i + 1}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="min-w-0 truncate font-bold" title={team.teamName}>
                    {team.teamName}
                  </span>
                  {mine ? <YouBadge /> : null}
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
          );
        })}
      </ol>
      <div className="hidden overflow-hidden rounded-card border bg-card lg:block">
        <table className="w-full text-sm" data-testid="power-rankings-table">
          <caption className="sr-only">Power rankings</caption>
          <thead className="border-b bg-muted text-left">
            <tr>
              <th scope="col" className="sl-label w-16 px-3 py-2">
                Rank
              </th>
              <th scope="col" className="sl-label px-3 py-2">
                Team
              </th>
              <th scope="col" className="sl-label px-3 py-2 text-right">
                Score
              </th>
              <th scope="col" className="sl-label px-3 py-2">
                Why
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {ranked.map((team, i) => {
              const mine = isMine(team.rosterId);
              return (
                <tr
                  key={team.rosterId}
                  data-testid="power-rankings-table-row"
                  data-mine={mine ? "true" : undefined}
                  className={`relative hover:bg-muted ${mine ? "bg-accent-soft hover:bg-accent-soft" : ""}`}
                >
                  <td
                    className={`px-3 py-1.5 font-bold tabular-nums ${
                      mine ? "shadow-[inset_3px_0_0_var(--highlight)]" : ""
                    }`}
                  >
                    {i + 1}
                  </td>
                  <th scope="row" className="max-w-xs px-3 py-1.5 text-left font-normal">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 truncate font-bold" title={team.teamName}>
                        {team.teamName}
                      </span>
                      {mine ? <YouBadge /> : null}
                    </span>
                  </th>
                  <td className="px-3 py-1.5 text-right font-bold tabular-nums">
                    {formatPowerScore(team.powerScore.score)}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">/100</span>
                  </td>
                  <td className="px-3 py-1.5">
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
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
