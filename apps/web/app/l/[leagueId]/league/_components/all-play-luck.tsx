import type { LeagueIntelligenceTeam } from "@sideline/shared";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { formatRecord } from "../../_components/format";
import { ReasonChips } from "../../../../../components/reason-chips";
import { WhySheet } from "../../../../../components/why-sheet";
import { formatRatePercent, formatSignedNumber } from "./format";

/**
 * LEAGUE-1/LEAGUE-2 UI: each team's schedule-neutral all-play record and luck (actual wins minus
 * all-play-expected wins). Sorted by all-play win rate, highest first, since that is the
 * schedule-neutral "who's actually good" read this section exists for (power rankings covers the
 * fuller composite).
 */
export function AllPlayLuckList({ teams }: { teams: readonly LeagueIntelligenceTeam[] }) {
  const sorted = [...teams].sort((a, b) => b.allPlay.winRate - a.allPlay.winRate);
  return (
    <ol
      className="flex flex-col divide-y rounded-card border bg-card"
      data-testid="all-play-luck-list"
    >
      {sorted.map((team) => {
        const luckValue = team.luck.luck;
        const dir = luckValue > 0.5 ? "up" : luckValue < -0.5 ? "down" : "flat";
        const Icon = dir === "up" ? ArrowUp : dir === "down" ? ArrowDown : Minus;
        const dirCls =
          dir === "up"
            ? "text-positive"
            : dir === "down"
              ? "text-negative"
              : "text-muted-foreground";
        const dirWord = dir === "up" ? "Lucky" : dir === "down" ? "Unlucky" : "Neutral";
        const reasons = [...team.allPlay.reasons, ...team.luck.reasons];
        return (
          <li
            key={team.rosterId}
            className="flex flex-col gap-1 px-3 py-2"
            data-testid="all-play-luck-row"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-bold" title={team.teamName}>
                {team.teamName}
              </span>
              <span className="shrink-0 text-right text-sm tabular-nums">
                <span className="font-bold">{formatRecord(team.allPlay)}</span>
                <span className="ml-1 text-muted-foreground">
                  all-play ({formatRatePercent(team.allPlay.winRate)})
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className={`inline-flex items-center gap-1 font-medium tabular-nums ${dirCls}`}>
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
  );
}
