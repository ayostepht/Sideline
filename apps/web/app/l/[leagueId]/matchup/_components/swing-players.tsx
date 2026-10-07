import type { MatchupSwingPlayer } from "@sideline/shared";
import { PlayerLink } from "../../../../../components/player-link";
import { teamLabel } from "../../../../../components/team-label";
import { Badge } from "../../../../../components/ui/badge";
import {
  WeatherChips,
  WeatherNote,
  weatherChipsFromWeather,
} from "../../../../../components/weather";
import { cn } from "../../../../../lib/client/cn";

export interface SwingPlayersListProps {
  /** Already sorted descending by `varianceContribution` (API contract). */
  players: readonly MatchupSwingPlayer[];
  yourRosterId: number;
  opponentTeamName: string;
}

/**
 * `varianceContribution` is this starter's share of the score-differential variance, in
 * points-squared (see `packages/core/src/sim/matchup.ts`). The square root converts it back to
 * points, the same unit as every other stat on this page, so it reads as "this player's score
 * could swing the result by about +/-N points" instead of an unexplained squared number.
 */
function swingPts(varianceContribution: number): string {
  return Math.sqrt(Math.max(0, varianceContribution)).toFixed(1);
}

/**
 * A swing player row, matching `PlayerRow`'s sizing and spacing conventions. `PlayerRow` itself
 * is not used here: it always renders a position badge and an NFL team ("No team" when absent),
 * and the matchup API's `swingPlayers` carries neither (only `playerId`, `name`, `rosterId`,
 * `varianceContribution`) - forcing those fields would show a misleading "FLEX, No team" on
 * every row instead of nothing. What matters here is which fantasy team each player belongs to
 * and how much they could swing the score, so that is what the row shows.
 */
function SwingPlayerRow({
  playerId,
  name,
  team,
  yours,
  opponentTeamName,
  swing,
  weather,
}: {
  playerId: string;
  name: string;
  /** Team subline text, null when unknown. */
  team: string | null;
  yours: boolean;
  opponentTeamName: string;
  swing: string;
  weather: MatchupSwingPlayer["weather"];
}) {
  return (
    <div
      className={cn(
        "relative flex min-h-11 w-full min-w-0 items-center gap-2 rounded-control border-l-2 px-2.5 py-1 transition-colors hover:bg-muted md:max-w-2xl",
        yours ? "border-foreground" : "border-transparent",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-base font-medium leading-5" title={name}>
          <PlayerLink playerId={playerId} stretch>
            {name}
          </PlayerLink>
        </span>
        {team ? (
          <span className="text-xs text-muted-foreground" data-testid="player-row-team">
            {team}
          </span>
        ) : null}
        <Badge variant={yours ? "you" : "neutral"} className="w-fit">
          {yours ? "You" : opponentTeamName}
        </Badge>
        <WeatherChips chips={weatherChipsFromWeather(weather)} className="relative" />
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-base font-bold tabular-nums">±{swing}</span>
        <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">
          pts swing
        </span>
      </span>
    </div>
  );
}

export function SwingPlayersList({
  players,
  yourRosterId,
  opponentTeamName,
}: SwingPlayersListProps) {
  if (players.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="matchup-swing-empty">
        No swing players yet. Check back once this week&apos;s starters are set.
      </p>
    );
  }
  const anyWeather = players.some((p) => weatherChipsFromWeather(p.weather).length > 0);
  return (
    <>
      {anyWeather ? (
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span>Weather flags are shown for starters.</span>
          <WeatherNote />
        </div>
      ) : null}
      <ul className="flex flex-col gap-1" data-testid="matchup-swing-list">
        {players.map((p) => (
          <li key={p.playerId} data-testid="matchup-swing-row">
            <SwingPlayerRow
              playerId={p.playerId}
              name={p.name}
              team={p.nflTeam === undefined ? null : teamLabel(p.position, p.nflTeam)}
              yours={p.rosterId === yourRosterId}
              opponentTeamName={opponentTeamName}
              swing={swingPts(p.varianceContribution)}
              weather={p.weather}
            />
          </li>
        ))}
      </ul>
    </>
  );
}
