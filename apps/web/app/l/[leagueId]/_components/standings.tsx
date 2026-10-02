import type { StandingsRow } from "@sideline/shared";
import Link from "next/link";
import { Badge } from "../../../../components/ui/badge";
import { leagueBase } from "../../../../lib/client/nav";
import { formatPoints, formatRecord } from "./format";

function YouBadge() {
  return (
    <Badge variant="accent" data-testid="standings-you">
      You
    </Badge>
  );
}

function TeamCell({ r }: { r: StandingsRow }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate font-medium" title={r.teamName}>
          {r.teamName}
        </span>
        {r.isMine ? <YouBadge /> : null}
      </span>
      {r.managerName ? (
        <span className="truncate text-xs text-muted-foreground">{r.managerName}</span>
      ) : null}
    </span>
  );
}

/** Semantic table at 1024 and up, card list below. Same data in both. */
export function StandingsList({
  rows,
  leagueId,
  week,
}: {
  rows: readonly StandingsRow[];
  leagueId: string;
  week: number | null;
}) {
  const href = (r: StandingsRow) =>
    `${leagueBase(leagueId)}/league/teams/${r.rosterId}${week === null ? "" : `?week=${week}`}`;
  return (
    <>
      <ol className="flex flex-col gap-2 lg:hidden" data-testid="standings-cards">
        {rows.map((r) => (
          <li key={r.rosterId}>
            <Link
              href={href(r)}
              data-testid="standings-card"
              data-mine={r.isMine ? "true" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-[12px] border px-3 py-3 ${
                r.isMine ? "bg-accent-soft" : "bg-card"
              }`}
            >
              <span className="w-6 shrink-0 text-center text-sm font-semibold tabular-nums">
                <span className="sr-only">Rank </span>
                {r.rank}
              </span>
              <TeamCell r={r} />
              <span className="ml-auto shrink-0 text-right text-sm tabular-nums">
                <span className="block font-semibold">{formatRecord(r)}</span>
                <span className="block text-xs text-muted-foreground">
                  {formatPoints(r.pointsFor)} PF
                </span>
                <span className="block text-xs text-muted-foreground">
                  {formatPoints(r.pointsAgainst)} PA
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
      <div className="hidden overflow-hidden rounded-[12px] border bg-card lg:block">
        <table className="w-full text-sm" data-testid="standings-table">
          <caption className="sr-only">League standings</caption>
          <thead className="bg-muted text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="w-16 px-4 py-3 font-medium">
                Rank
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Team
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                Record
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                PF
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                PA
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr
                key={r.rosterId}
                data-testid="standings-row"
                data-mine={r.isMine ? "true" : undefined}
                className={r.isMine ? "bg-accent-soft" : undefined}
              >
                <td className="px-4 py-3 tabular-nums">{r.rank}</td>
                <th scope="row" className="max-w-xs px-4 py-3 text-left font-normal">
                  <Link href={href(r)} className="flex min-h-11 items-center hover:underline">
                    <TeamCell r={r} />
                  </Link>
                </th>
                <td className="px-4 py-3 text-right tabular-nums">{formatRecord(r)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatPoints(r.pointsFor)}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatPoints(r.pointsAgainst)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
