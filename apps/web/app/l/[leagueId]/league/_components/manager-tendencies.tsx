import type { LeagueIntelligenceTeam } from "@sideline/shared";
import { Badge } from "../../../../../components/ui/badge";
import { ReasonChips } from "../../../../../components/reason-chips";
import { formatFaab } from "./format";

function YouBadge() {
  return (
    <Badge variant="you" data-testid="manager-tendencies-you">
      You
    </Badge>
  );
}

/**
 * LEAGUE-6 UI: transaction, trade and waiver-claim counts per team, plus FAAB figures when the
 * league uses FAAB waivers. `faab*` fields are `null` for every team in a non-FAAB league (not
 * `0`): that is a distinct "not applicable" state, shown as a one-line note instead of per-team
 * zeros so it never reads as "this team spent nothing" (AC4).
 *
 * Mobile shows one card per team (unchanged); `lg` and up additionally shows a denser `<table>`
 * (T6.3c), matching the house convention in `standings.tsx`/`positional-strength-grid.tsx`. Both
 * exist in the DOM at every width; CSS hides one. `myRosterId` marks the viewer's own row.
 */
export function ManagerTendenciesList({
  teams,
  myRosterId = null,
}: {
  teams: readonly LeagueIntelligenceTeam[];
  myRosterId?: number | null;
}) {
  const isFaabLeague = teams.some((t) => t.managerTendencies.faabSpent !== null);
  const isMine = (rosterId: number) => myRosterId !== null && rosterId === myRosterId;
  return (
    <div className="flex flex-col gap-2">
      {!isFaabLeague ? (
        <p className="text-sm text-muted-foreground">
          This league does not use FAAB waivers, so no bid figures apply.
        </p>
      ) : null}
      <ol
        className="flex flex-col divide-y rounded-card border bg-card lg:hidden"
        data-testid="manager-tendencies-list"
      >
        {teams.map((team) => {
          const m = team.managerTendencies;
          const mine = isMine(team.rosterId);
          return (
            <li
              key={team.rosterId}
              className={`flex flex-col gap-1 px-3 py-2 ${
                mine ? "bg-accent-soft shadow-[inset_3px_0_0_var(--highlight)]" : ""
              }`}
              data-testid="manager-tendencies-row"
              data-mine={mine ? "true" : undefined}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 truncate font-bold" title={team.teamName}>
                  {team.teamName}
                </span>
                {mine ? <YouBadge /> : null}
              </span>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm tabular-nums">
                <span>
                  <span className="font-bold">{m.transactionCount}</span>{" "}
                  <span className="text-muted-foreground">
                    {m.transactionCount === 1 ? "transaction" : "transactions"}
                  </span>
                </span>
                <span>
                  <span className="font-bold">{m.tradeCount}</span>{" "}
                  <span className="text-muted-foreground">
                    {m.tradeCount === 1 ? "trade" : "trades"}
                  </span>
                </span>
                <span>
                  <span className="font-bold">{m.waiverClaimsWon}</span>{" "}
                  <span className="text-muted-foreground">
                    {m.waiverClaimsWon === 1 ? "waiver claim won" : "waiver claims won"}
                  </span>
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
      <div className="hidden overflow-hidden rounded-card border bg-card lg:block">
        <table className="w-full text-sm" data-testid="manager-tendencies-table">
          <caption className="sr-only">Manager tendencies</caption>
          <thead className="border-b bg-muted text-left">
            <tr>
              <th scope="col" className="sl-label px-3 py-2">
                Team
              </th>
              <th scope="col" className="sl-label px-3 py-2 text-right">
                Transactions
              </th>
              <th scope="col" className="sl-label px-3 py-2 text-right">
                Trades
              </th>
              <th scope="col" className="sl-label px-3 py-2 text-right">
                Waiver claims won
              </th>
              {isFaabLeague ? (
                <>
                  <th scope="col" className="sl-label px-3 py-2 text-right">
                    FAAB spent
                  </th>
                  <th scope="col" className="sl-label px-3 py-2 text-right">
                    Remaining
                  </th>
                  <th scope="col" className="sl-label px-3 py-2 text-right">
                    Avg bid
                  </th>
                  <th scope="col" className="sl-label px-3 py-2 text-right">
                    Max bid
                  </th>
                </>
              ) : null}
              <th scope="col" className="sl-label px-3 py-2">
                Why
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {teams.map((team) => {
              const m = team.managerTendencies;
              const mine = isMine(team.rosterId);
              return (
                <tr
                  key={team.rosterId}
                  data-testid="manager-tendencies-table-row"
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
                  <td className="px-3 py-1.5 text-right tabular-nums">{m.transactionCount}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{m.tradeCount}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{m.waiverClaimsWon}</td>
                  {isFaabLeague ? (
                    <>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {m.faabSpent === null ? "N/A" : formatFaab(m.faabSpent)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {m.faabRemaining === null ? "N/A" : formatFaab(m.faabRemaining)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {m.faabAverageWinningBid === null
                          ? "N/A"
                          : formatFaab(m.faabAverageWinningBid)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {m.faabMaxWinningBid === null ? "N/A" : formatFaab(m.faabMaxWinningBid)}
                      </td>
                    </>
                  ) : null}
                  <td className="px-3 py-1.5">
                    <ReasonChips reasons={m.reasons} max={2} />
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
