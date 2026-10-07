import type { TradePlayerRef } from "@sideline/shared";
import { PlayerLink } from "../../../../../components/player-link";
import { PositionBadge } from "../../../../../components/position-badge";

/** One side of a trade: who moves. Names open the player card. */
export function TradePlayers({
  heading,
  players,
  testid,
}: {
  heading: string;
  players: readonly TradePlayerRef[];
  testid: string;
}) {
  return (
    <div className="min-w-0" data-testid={testid}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {heading}
      </h3>
      <ul className="mt-1 flex flex-col">
        {players.map((p) => (
          <li key={p.playerId} className="flex min-h-11 min-w-0 items-center gap-2">
            <PositionBadge position={p.position} />
            <PlayerLink playerId={p.playerId} className="min-w-0 truncate text-sm font-medium">
              {p.name}
            </PlayerLink>
            {p.nflTeam ? (
              <span className="shrink-0 text-xs text-muted-foreground">{p.nflTeam}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
