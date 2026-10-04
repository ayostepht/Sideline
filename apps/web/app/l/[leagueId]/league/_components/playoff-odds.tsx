import type { LeagueIntelligenceTeam } from "@sideline/shared";
import { Badge } from "../../../../../components/ui/badge";
import { ReasonChips } from "../../../../../components/reason-chips";
import { formatRatePercent } from "./format";

type TeamWithOdds = LeagueIntelligenceTeam & {
  playoffOdds: NonNullable<LeagueIntelligenceTeam["playoffOdds"]>;
};

function hasOdds(team: LeagueIntelligenceTeam): team is TeamWithOdds {
  return team.playoffOdds !== null;
}

function YouBadge() {
  return (
    <Badge variant="you" data-testid="playoff-odds-you">
      You
    </Badge>
  );
}

function SeedChances({ team }: { team: TeamWithOdds }) {
  if (team.playoffOdds.seedDistribution.length === 0) return null;
  return (
    <details className="text-sm">
      <summary className="min-h-11 cursor-pointer select-none py-1 font-medium text-foreground underline underline-offset-4">
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
              <td className="text-right tabular-nums">{formatRatePercent(s.probability)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/**
 * LEAGUE-5 UI: each team's Monte Carlo playoff percentage, highest first. `playoffOdds` is `null`
 * for every team at once exactly when `playoffTeams` is unknown or out of range (the data
 * function's own doc, trusted over its slightly imprecise comment) -- handled here as one
 * explanatory panel rather than per-team blanks (AC3). `reasons` on `playoffOdds` is a season-level
 * signal identical across every team (e.g. "no remaining games"), so it is shown once, not per row.
 *
 * Mobile shows one card per team (unchanged); `lg` and up additionally shows a denser `<table>`
 * (T6.3c), matching the house convention in `standings.tsx`/`positional-strength-grid.tsx`. Both
 * exist in the DOM at every width; CSS hides one. `myRosterId` marks the viewer's own row.
 */
export function PlayoffOddsSection({
  teams,
  playoffTeams,
  myRosterId = null,
}: {
  teams: readonly LeagueIntelligenceTeam[];
  playoffTeams: number | null;
  myRosterId?: number | null;
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
  const isMine = (rosterId: number) => myRosterId !== null && rosterId === myRosterId;

  return (
    <div className="flex flex-col gap-2">
      <ReasonChips reasons={seasonReasons} />
      <ol
        className="flex flex-col divide-y rounded-card border bg-card lg:hidden"
        data-testid="playoff-odds-list"
      >
        {sorted.map((team) => {
          const mine = isMine(team.rosterId);
          return (
            <li
              key={team.rosterId}
              className={`flex flex-col gap-1 px-3 py-2 ${
                mine ? "bg-accent-soft shadow-[inset_3px_0_0_var(--highlight)]" : ""
              }`}
              data-testid="playoff-odds-row"
              data-mine={mine ? "true" : undefined}
            >
              <div className="flex items-center gap-2">
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="min-w-0 truncate font-bold" title={team.teamName}>
                    {team.teamName}
                  </span>
                  {mine ? <YouBadge /> : null}
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
              <SeedChances team={team} />
            </li>
          );
        })}
      </ol>
      <div className="hidden overflow-hidden rounded-card border bg-card lg:block">
        <table className="w-full text-sm" data-testid="playoff-odds-table">
          <caption className="sr-only">Playoff odds</caption>
          <thead className="border-b bg-muted text-left">
            <tr>
              <th scope="col" className="sl-label px-3 py-2">
                Team
              </th>
              <th scope="col" className="sl-label px-3 py-2 text-right">
                Playoff chance
              </th>
              <th scope="col" className="sl-label px-3 py-2 text-right">
                Bye chance
              </th>
              <th scope="col" className="sl-label px-3 py-2">
                Seed chances
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.map((team) => {
              const mine = isMine(team.rosterId);
              return (
                <tr
                  key={team.rosterId}
                  data-testid="playoff-odds-table-row"
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
                  <td className="px-3 py-1.5 text-right font-bold tabular-nums">
                    {formatRatePercent(team.playoffOdds.playoffPct)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {team.playoffOdds.byePct !== null
                      ? formatRatePercent(team.playoffOdds.byePct)
                      : "N/A"}
                  </td>
                  <td className="px-3 py-1.5">
                    <SeedChances team={team} />
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
