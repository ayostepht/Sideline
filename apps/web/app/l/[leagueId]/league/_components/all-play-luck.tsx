import type { LeagueIntelligenceTeam } from "@sideline/shared";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { formatRecord } from "../../_components/format";
import { Badge } from "../../../../../components/ui/badge";
import { ReasonChips } from "../../../../../components/reason-chips";
import { WhySheet } from "../../../../../components/why-sheet";
import { formatRatePercent, formatSignedNumber } from "./format";

function YouBadge() {
  return (
    <Badge variant="you" data-testid="all-play-luck-you">
      You
    </Badge>
  );
}

/**
 * LEAGUE-1/LEAGUE-2 UI: each team's schedule-neutral all-play record and luck (actual wins minus
 * all-play-expected wins). Sorted by all-play win rate, highest first, since that is the
 * schedule-neutral "who's actually good" read this section exists for (power rankings covers the
 * fuller composite).
 *
 * Mobile shows one card per team (unchanged); `lg` and up additionally shows a denser `<table>`
 * (T6.3c), matching the house convention in `standings.tsx`/`positional-strength-grid.tsx`. Both
 * exist in the DOM at every width; CSS hides one. `myRosterId` marks the viewer's own row.
 */
export function AllPlayLuckList({
  teams,
  myRosterId = null,
}: {
  teams: readonly LeagueIntelligenceTeam[];
  myRosterId?: number | null;
}) {
  const sorted = [...teams].sort((a, b) => b.allPlay.winRate - a.allPlay.winRate);
  const isMine = (rosterId: number) => myRosterId !== null && rosterId === myRosterId;

  const luckDisplay = (team: LeagueIntelligenceTeam) => {
    const luckValue = team.luck.luck;
    const dir = luckValue > 0.5 ? "up" : luckValue < -0.5 ? "down" : "flat";
    const Icon = dir === "up" ? ArrowUp : dir === "down" ? ArrowDown : Minus;
    const dirCls =
      dir === "up" ? "text-positive" : dir === "down" ? "text-negative" : "text-muted-foreground";
    const dirWord = dir === "up" ? "Lucky" : dir === "down" ? "Unlucky" : "Neutral";
    return { luckValue, Icon, dirCls, dirWord };
  };

  return (
    <>
      <ol
        className="flex flex-col divide-y rounded-card border bg-card lg:hidden"
        data-testid="all-play-luck-list"
      >
        {sorted.map((team) => {
          const { luckValue, Icon, dirCls, dirWord } = luckDisplay(team);
          const reasons = [...team.allPlay.reasons, ...team.luck.reasons];
          const mine = isMine(team.rosterId);
          return (
            <li
              key={team.rosterId}
              className={`flex flex-col gap-1 px-3 py-2 ${
                mine ? "bg-accent-soft shadow-[inset_3px_0_0_var(--highlight)]" : ""
              }`}
              data-testid="all-play-luck-row"
              data-mine={mine ? "true" : undefined}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="min-w-0 truncate font-bold" title={team.teamName}>
                    {team.teamName}
                  </span>
                  {mine ? <YouBadge /> : null}
                </span>
                <span className="shrink-0 text-right text-sm tabular-nums">
                  <span className="font-bold">{formatRecord(team.allPlay)}</span>
                  <span className="ml-1 text-muted-foreground">
                    all-play ({formatRatePercent(team.allPlay.winRate)})
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span
                  className={`inline-flex items-center gap-1 font-medium tabular-nums ${dirCls}`}
                >
                  <Icon className="size-4" aria-hidden />
                  <span className="sr-only">{dirWord} </span>
                  {formatSignedNumber(luckValue)} luck
                </span>
                <span className="text-muted-foreground">
                  (actual {team.luck.actualWins.toFixed(1)} vs expected{" "}
                  {team.luck.expectedWins.toFixed(1)} wins)
                </span>
              </div>
              <ReasonChips
                reasons={reasons}
                max={2}
                trailing={
                  reasons.length > 0 ? (
                    <WhySheet
                      title={`${team.teamName}: all-play and luck`}
                      summary={{ label: "Luck", value: formatSignedNumber(luckValue) }}
                      reasons={reasons}
                    />
                  ) : null
                }
              />
            </li>
          );
        })}
      </ol>
      <div className="hidden overflow-hidden rounded-card border bg-card lg:block">
        <table className="w-full text-sm" data-testid="all-play-luck-table">
          <caption className="sr-only">All-play record and luck</caption>
          <thead className="border-b bg-muted text-left">
            <tr>
              <th scope="col" className="sl-label px-3 py-2">
                Team
              </th>
              <th scope="col" className="sl-label px-3 py-2 text-right">
                All-play
              </th>
              <th scope="col" className="sl-label px-3 py-2 text-right">
                Luck
              </th>
              <th scope="col" className="sl-label px-3 py-2">
                Why
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.map((team) => {
              const { luckValue, Icon, dirCls, dirWord } = luckDisplay(team);
              const reasons = [...team.allPlay.reasons, ...team.luck.reasons];
              const mine = isMine(team.rosterId);
              return (
                <tr
                  key={team.rosterId}
                  data-testid="all-play-luck-table-row"
                  data-mine={mine ? "true" : undefined}
                  className={`relative hover:bg-muted ${mine ? "bg-accent-soft hover:bg-accent-soft" : ""}`}
                >
                  <th
                    scope="row"
                    className={`max-w-xs px-3 py-1.5 text-left font-normal ${
                      mine ? "shadow-[inset_3px_0_0_var(--highlight)]" : ""
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 truncate font-bold" title={team.teamName}>
                        {team.teamName}
                      </span>
                      {mine ? <YouBadge /> : null}
                    </span>
                  </th>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    <span className="font-bold">{formatRecord(team.allPlay)}</span>
                    <span className="ml-1 text-muted-foreground">
                      ({formatRatePercent(team.allPlay.winRate)})
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    <span className={`inline-flex items-center gap-1 font-medium ${dirCls}`}>
                      <Icon className="size-4" aria-hidden />
                      <span className="sr-only">{dirWord} </span>
                      {formatSignedNumber(luckValue)}
                    </span>
                  </td>
                  <td className="px-3 py-1.5">
                    <ReasonChips
                      reasons={reasons}
                      max={2}
                      trailing={
                        reasons.length > 0 ? (
                          <WhySheet
                            title={`${team.teamName}: all-play and luck`}
                            summary={{ label: "Luck", value: formatSignedNumber(luckValue) }}
                            reasons={reasons}
                          />
                        ) : null
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
