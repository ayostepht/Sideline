import type { PlayerListItem } from "@sideline/shared";
import Link from "next/link";
import { InjuryBadge } from "../../../../../components/injury-badge";
import { teamLabel } from "../../../../../components/team-label";
import { PositionBadge } from "../../../../../components/position-badge";
import { TrendIndicator } from "../../../../../components/trend-indicator";
import { formatDelta, formatPpg, playerHref, signalToTrend } from "./format";

/**
 * T4.6b (PLAN 6.4): the players list, same data as a card list under 1024px and a semantic table
 * at 1024px and up (the house pattern: see `_components/standings.tsx`'s `StandingsList`).
 *
 * The list view only carries TREND-1 (points) fields (see `lib/server/players.ts`'s module doc):
 * usage, consistency, and Sleeper momentum are deferred to the detail page for performance, so
 * this table does not have a "key usage stat" or "ROS value" column yet (see T4.6b's task report
 * for the backend follow-up).
 */
export function PlayersList({
  leagueId,
  players,
}: {
  leagueId: string;
  players: readonly PlayerListItem[];
}) {
  return (
    <>
      <ol
        className="flex flex-col divide-y rounded-card border bg-card lg:hidden"
        data-testid="players-cards"
      >
        {players.map((p) => {
          const trend = signalToTrend(p.signal);
          return (
            <li key={p.playerId}>
              <Link
                href={playerHref(leagueId, p.playerId)}
                prefetch={false}
                data-testid="players-row"
                className="flex min-h-11 items-center gap-2 px-3 py-2 hover:bg-muted active:bg-border"
              >
                <PositionBadge position={p.position} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">{p.name}</span>
                    <InjuryBadge status={p.injuryStatus} />
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {teamLabel(p.position, p.nflTeam)}
                  </span>
                </span>
                <span className="shrink-0 text-right text-sm tabular-nums">
                  <span className="block font-bold">{formatPpg(p.seasonPpg)}</span>
                  <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">
                    PPG
                  </span>
                </span>
                <span className="w-20 shrink-0 text-right">
                  {trend !== null ? (
                    <TrendIndicator trend={trend} detail={formatDelta(p.l3Delta)} />
                  ) : (
                    <span className="text-xs text-muted-foreground">No data</span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      <div className="hidden overflow-x-auto rounded-card border bg-card lg:block">
        <table className="w-full text-sm" data-testid="players-table">
          <caption className="sr-only">Players</caption>
          <thead className="border-b bg-muted text-left">
            <tr>
              <th scope="col" className="sl-label px-3 py-2">
                Player
              </th>
              <th scope="col" className="sl-label px-3 py-2 text-right">
                PPG
              </th>
              <th scope="col" className="sl-label px-3 py-2 text-right">
                L3
              </th>
              <th scope="col" className="sl-label px-3 py-2 text-right">
                Trend
              </th>
              <th scope="col" className="sl-label px-3 py-2 text-right">
                Games
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {players.map((p) => {
              const trend = signalToTrend(p.signal);
              return (
                <tr key={p.playerId} data-testid="players-table-row" className="hover:bg-muted">
                  <th scope="row" className="max-w-xs px-3 py-1 text-left font-normal">
                    {/* The after element stretches the link over the whole row. */}
                    <Link
                      href={playerHref(leagueId, p.playerId)}
                      prefetch={false}
                      className="relative flex min-h-11 items-center gap-2 after:absolute after:inset-0 after:content-['']"
                    >
                      <PositionBadge position={p.position} />
                      <span className="flex min-w-0 flex-col">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-medium" title={p.name}>
                            {p.name}
                          </span>
                          <InjuryBadge status={p.injuryStatus} />
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {teamLabel(p.position, p.nflTeam)}
                        </span>
                      </span>
                    </Link>
                  </th>
                  <td className="px-3 py-1 text-right tabular-nums">{formatPpg(p.seasonPpg)}</td>
                  <td className="px-3 py-1 text-right tabular-nums">{formatPpg(p.l3Ppg)}</td>
                  <td className="px-3 py-1 text-right">
                    {trend !== null ? (
                      <TrendIndicator trend={trend} detail={formatDelta(p.l3Delta)} />
                    ) : (
                      <span className="text-xs text-muted-foreground">No data</span>
                    )}
                  </td>
                  <td className="px-3 py-1 text-right tabular-nums">{p.gamesPlayed}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
