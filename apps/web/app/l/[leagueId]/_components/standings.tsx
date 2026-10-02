import type { StandingsRow } from "@sideline/shared";
import { ChevronRight } from "lucide-react";
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
        <span className="truncate font-bold" title={r.teamName}>
          {r.teamName}
        </span>
        {r.isMine ? <YouBadge /> : null}
      </span>
      {r.managerName && r.managerName.trim().toLowerCase() !== r.teamName.trim().toLowerCase() ? (
        <span className="truncate text-xs text-muted-foreground">{r.managerName}</span>
      ) : null}
    </span>
  );
}

/** Semantic table at 1024 and up, divided list below. Same data in both. */
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
      <ol
        className="flex flex-col divide-y rounded-card border bg-card lg:hidden"
        data-testid="standings-cards"
      >
        {rows.map((r) => (
          <li key={r.rosterId}>
            <Link
              href={href(r)}
              data-testid="standings-card"
              data-mine={r.isMine ? "true" : undefined}
              className={`flex min-h-11 items-center gap-2 px-3 py-2 ${
                r.isMine ? "bg-accent-soft" : ""
              }`}
            >
              <span className="w-6 shrink-0 text-center text-sm font-bold tabular-nums">
                <span className="sr-only">Rank </span>
                {r.rank}
              </span>
              <TeamCell r={r} />
              <span className="ml-auto shrink-0 text-right text-sm tabular-nums">
                <span className="block font-bold">{formatRecord(r)}</span>
                <span className="block text-xs text-muted-foreground">
                  {formatPoints(r.pointsFor)} PF
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ol>
      <div className="hidden overflow-hidden rounded-card border bg-card lg:block">
        <table className="w-full text-sm" data-testid="standings-table">
          <caption className="sr-only">League standings</caption>
          <thead className="border-b bg-muted text-left">
            <tr>
              <th scope="col" className="sl-label w-16 px-3 py-2">
                Rank
              </th>
              <th scope="col" className="sl-label px-3 py-2">
                Team
              </th>
              <th scope="col" className="sl-label px-3 py-2 text-right">
                Record
              </th>
              <th scope="col" className="sl-label px-3 py-2 text-right">
                PF
              </th>
              <th scope="col" className="sl-label px-3 py-2 text-right">
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
                className={`relative hover:bg-muted ${r.isMine ? "bg-accent-soft hover:bg-accent-soft" : ""}`}
              >
                <td className="px-3 py-1 font-bold tabular-nums">{r.rank}</td>
                <th scope="row" className="max-w-xs px-3 py-1 text-left font-normal">
                  {/* The after element stretches the link over the whole row. */}
                  <Link
                    href={href(r)}
                    className="flex min-h-11 items-center after:absolute after:inset-0 after:content-['']"
                  >
                    <TeamCell r={r} />
                  </Link>
                </th>
                <td className="px-3 py-1 text-right font-bold tabular-nums">{formatRecord(r)}</td>
                <td className="px-3 py-1 text-right tabular-nums">{formatPoints(r.pointsFor)}</td>
                <td className="px-3 py-1 text-right tabular-nums">
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
