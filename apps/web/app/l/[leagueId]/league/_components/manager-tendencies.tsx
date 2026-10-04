import type { LeagueIntelligenceTeam } from "@sideline/shared";
import { ReasonChips } from "../../../../../components/reason-chips";
import { formatFaab } from "./format";

/**
 * LEAGUE-6 UI: transaction, trade and waiver-claim counts per team, plus FAAB figures when the
 * league uses FAAB waivers. `faab*` fields are `null` for every team in a non-FAAB league (not
 * `0`): that is a distinct "not applicable" state, shown as a one-line note instead of per-team
 * zeros so it never reads as "this team spent nothing" (AC4).
 */
export function ManagerTendenciesList({ teams }: { teams: readonly LeagueIntelligenceTeam[] }) {
  const isFaabLeague = teams.some((t) => t.managerTendencies.faabSpent !== null);
  return (
    <div className="flex flex-col gap-2">
      {!isFaabLeague ? (
        <p className="text-sm text-muted-foreground">
          This league does not use FAAB waivers, so no bid figures apply.
        </p>
      ) : null}
      <ol
        className="flex flex-col divide-y rounded-card border bg-card"
        data-testid="manager-tendencies-list"
      >
        {teams.map((team) => {
          const m = team.managerTendencies;
          return (
            <li
              key={team.rosterId}
              className="flex flex-col gap-1 px-3 py-2"
              data-testid="manager-tendencies-row"
            >
              <span className="truncate font-bold" title={team.teamName}>
                {team.teamName}
              </span>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm tabular-nums">
                <span>
                  <span className="font-bold">{m.transactionCount}</span>{" "}
                  <span className="text-muted-foreground">transactions</span>
                </span>
                <span>
                  <span className="font-bold">{m.tradeCount}</span>{" "}
                  <span className="text-muted-foreground">trades</span>
                </span>
                <span>
                  <span className="font-bold">{m.waiverClaimsWon}</span>{" "}
                  <span className="text-muted-foreground">waiver claims won</span>
                </span>
                {isFaabLeague ? (
                  <>
                    <span>
                      <span className="font-bold">
                        {m.faabSpent === null ? "N/A" : formatFaab(m.faabSpent)}
                      </span>{" "}
                      <span className="text-muted-foreground">FAAB spent</span>
                    </span>
                    <span>
                      <span className="font-bold">
                        {m.faabRemaining === null ? "N/A" : formatFaab(m.faabRemaining)}
                      </span>{" "}
                      <span className="text-muted-foreground">remaining</span>
                    </span>
                    <span>
                      <span className="font-bold">
                        {m.faabAverageWinningBid === null
                          ? "N/A"
                          : formatFaab(m.faabAverageWinningBid)}
                      </span>{" "}
                      <span className="text-muted-foreground">avg bid</span>
                    </span>
                    <span>
                      <span className="font-bold">
                        {m.faabMaxWinningBid === null ? "N/A" : formatFaab(m.faabMaxWinningBid)}
                      </span>{" "}
                      <span className="text-muted-foreground">max bid</span>
                    </span>
                  </>
                ) : null}
              </div>
              <ReasonChips reasons={m.reasons} max={2} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
