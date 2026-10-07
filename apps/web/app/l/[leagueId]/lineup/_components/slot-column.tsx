import type { LineupMode, LineupPlayer, LineupSlotAssignment } from "@sideline/shared";
import { Lock, Plus } from "lucide-react";
import { MatchupGrade } from "../../../../../components/matchup-grade";
import { PlayerRow } from "../../../../../components/player-row";
import { Badge } from "../../../../../components/ui/badge";
import { WhySheet } from "../../../../../components/why-sheet";
import { formatValue, MODE_STAT_LABEL, playerById } from "./format";

/**
 * One side of the current-vs-optimal comparison (LINEUP-6): every slot in order, each resolved
 * to its player via `lineup.players`, or an empty-slot placeholder when `playerId` is null.
 */
export function SlotColumn({
  title,
  assignment,
  players,
  mode,
  week,
  showReasons,
  testid,
}: {
  title: string;
  assignment: readonly LineupSlotAssignment[];
  players: readonly LineupPlayer[];
  mode: LineupMode;
  week: number;
  showReasons: boolean;
  testid: string;
}) {
  return (
    <section aria-labelledby={`${testid}-h`} data-testid={testid}>
      <h2 id={`${testid}-h`} className="sl-label sl-mark mb-1">
        {title}
      </h2>
      <div className="flex flex-col divide-y rounded-card border bg-card">
        {assignment.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">No slots configured.</p>
        ) : null}
        {assignment.map((slot, i) => {
          const player = playerById(players, slot.playerId);
          if (player === null) {
            return (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: slot types can repeat (two FLEX)
                key={`${slot.slotType}-${i}`}
                className="flex min-h-11 items-center gap-3 px-3 py-2"
                data-testid="lineup-empty-slot"
              >
                <span className="w-9 shrink-0 text-xs font-medium text-muted-foreground">
                  {slot.slotType}
                </span>
                <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                  <Plus className="size-4" aria-hidden />
                  Empty slot
                </span>
              </div>
            );
          }
          const bye = player.byeWeek === week;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: slot types can repeat (two FLEX)
            <div key={`${slot.slotType}-${i}-${player.playerId}`} data-testid={`${testid}-row`}>
              <PlayerRow
                name={player.name}
                playerId={player.playerId}
                position={player.position}
                team={player.nflTeam}
                injuryStatus={player.injuryStatus}
                slot={slot.slotType}
                stat={formatValue(player.value)}
                statLabel={MODE_STAT_LABEL[mode]}
                className="md:max-w-none"
                meta={
                  <>
                    {bye ? <Badge variant="info">Bye</Badge> : null}
                    {player.locked ? (
                      <Badge variant="neutral" data-testid="lineup-locked-badge">
                        <Lock className="size-3" aria-hidden />
                        Locked{player.kickoffApproximate ? " (approx.)" : ""}
                      </Badge>
                    ) : null}
                    {player.matchupGrade !== null ? (
                      <MatchupGrade grade={player.matchupGrade} />
                    ) : null}
                  </>
                }
              />
              {showReasons ? (
                <div className="px-2 pb-2">
                  <WhySheet
                    title={player.name}
                    summary={{ label: MODE_STAT_LABEL[mode], value: formatValue(player.value) }}
                    reasons={player.reasons}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
