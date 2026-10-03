"use client";

import type { WaiverCandidate, WaiverPriorityCandidate, WaiverResponse } from "@sideline/shared";
import { Loader2, Users } from "lucide-react";
import { usePathname } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { EmptyState, ErrorState } from "../../../../../components/empty-state";
import { InjuryBadge } from "../../../../../components/injury-badge";
import { MatchupGrade } from "../../../../../components/matchup-grade";
import { PositionBadge } from "../../../../../components/position-badge";
import { TrendIndicator } from "../../../../../components/trend-indicator";
import { Button } from "../../../../../components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "../../../../../components/ui/toggle-group";
import { WhySheet } from "../../../../../components/why-sheet";
import { gradeFromScore, type Grade } from "../../../../../components/grade";
import { apiJson } from "../../../../../lib/client/api";
import { cn } from "../../../../../lib/client/cn";
import {
  buildWaiversPageQuery,
  buildWaiversQuery,
  claimBadgeInfo,
  competingFlagReasons,
  formatScore,
  formatSignedPoints,
  reasonValue,
  suggestedDropText,
  toTrend,
  VIEW_LABEL,
  WAIVER_POSITIONS,
  type DropPlayerInfo,
  type WaiverView,
} from "./format";

interface WaiverBoardProps {
  leagueId: string;
  week: number;
  initialView: WaiverView;
  initialPositions: readonly string[];
  initialData: WaiverResponse;
  /** `suggestedDropPlayerId` keyed lookup (plain object: Server to Client Component props must be
   * JSON serializable, so this travels as a record and is wrapped in a `Map` here). */
  drops: Record<string, DropPlayerInfo>;
}

type FetchStatus = "idle" | "loading" | "error";

const WAIVER_VIEWS: readonly WaiverView[] = ["mine", "available"];

/** One candidate's derived, already-computed display fields (pure; no re-fetching). */
interface RowMeta {
  trend: ReturnType<typeof toTrend>;
  grade: Grade | null;
  dropText: string;
  priority: WaiverPriorityCandidate | undefined;
  competing: ReturnType<typeof competingFlagReasons>;
}

function rowMeta(
  candidate: WaiverCandidate,
  drops: ReadonlyMap<string, DropPlayerInfo>,
  priorityByPlayer: ReadonlyMap<string, WaiverPriorityCandidate>,
): RowMeta {
  const scheduleValue = reasonValue(candidate.reasons, "WAIVER_SCORE_SCHEDULE");
  const priority = priorityByPlayer.get(candidate.playerId);
  return {
    trend: toTrend(candidate.trendSignal),
    grade: scheduleValue === undefined ? null : gradeFromScore(scheduleValue),
    dropText: suggestedDropText(candidate.suggestedDropPlayerId, drops),
    priority,
    competing: priority ? competingFlagReasons(priority.competingTeams) : [],
  };
}

/**
 * WAIVER-1..WAIVER-6d (PLAN 6.4): the interactive candidate board. A client component because the
 * position filter refetches `/api/l/{leagueId}/waivers` directly (see the task brief: this keeps
 * switching the "for my team"/"best available" tab free of any network round trip, since the API
 * always returns both views together for a given position filter - see `getWaivers`'s module doc -
 * so only a position change needs a new request). The URL is kept in sync via `history.replaceState`
 * rather than `next/navigation`'s router, which would re-render the page's Server Component (and
 * re-run `getWaivers` a second time) on every filter click.
 */
export function WaiverBoard({
  leagueId,
  week,
  initialView,
  initialPositions,
  initialData,
  drops,
}: WaiverBoardProps) {
  const pathname = usePathname();
  const [view, setView] = useState<WaiverView>(initialView);
  const [positions, setPositions] = useState<string[]>([...initialPositions]);
  const [data, setData] = useState<WaiverResponse>(initialData);
  const [status, setStatus] = useState<FetchStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const dropsMap = useMemo(() => new Map(Object.entries(drops)), [drops]);
  const priorityByPlayer = useMemo(
    () => new Map(data.priorityAdvisor.candidates.map((c) => [c.playerId, c] as const)),
    [data.priorityAdvisor.candidates],
  );

  function syncUrl(nextView: WaiverView, nextPositions: string[]) {
    const qs = buildWaiversPageQuery(week, nextView, nextPositions);
    window.history.replaceState(null, "", `${pathname}?${qs}`);
  }

  function runFetch(nextPositions: string[]): void {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus("loading");
    setError(null);
    const qs = buildWaiversQuery(week, nextPositions);
    // apiJson never throws (network and parse failures come back as `ok: false`), so there is no
    // rejection path to handle here beyond the `.then` below.
    void apiJson(`/api/l/${encodeURIComponent(leagueId)}/waivers?${qs}`, "WaiverResponseSchema", {
      signal: controller.signal,
    }).then((res) => {
      if (controller.signal.aborted) return;
      if (res.ok) {
        setData(res.data);
        setStatus("idle");
      } else {
        setStatus("error");
        setError(res.message);
      }
    });
  }

  function handleViewChange(next: WaiverView) {
    setView(next);
    syncUrl(next, positions);
  }

  function handlePositionsChange(next: string[]) {
    const ordered = WAIVER_POSITIONS.filter((p) => next.includes(p));
    setPositions(ordered);
    syncUrl(view, ordered);
    runFetch(ordered);
  }

  const candidates = view === "mine" ? data.forMyTeam : data.bestAvailable;

  return (
    <section className="flex flex-col gap-3" aria-label="Waiver candidates">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="group"
          aria-label="Waiver view"
          data-testid="waivers-view-toggle"
          className="inline-flex max-w-full gap-0.5 rounded-control bg-muted p-0.5"
        >
          {WAIVER_VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              aria-current={view === v ? "true" : undefined}
              data-testid={`waivers-view-toggle-${v}`}
              onClick={() => {
                handleViewChange(v);
              }}
              className={cn(
                "inline-flex min-h-11 items-center justify-center rounded-control px-3 text-sm font-medium transition-colors duration-150",
                view === v
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-card",
              )}
            >
              {VIEW_LABEL[v]}
            </button>
          ))}
        </div>
        <ToggleGroup
          type="multiple"
          value={positions}
          onValueChange={handlePositionsChange}
          aria-label="Filter by position"
          data-testid="waivers-position-filter"
        >
          {WAIVER_POSITIONS.map((p) => (
            <ToggleGroupItem
              key={p}
              value={p}
              aria-label={`Filter to ${p}`}
              data-testid={`waivers-position-filter-${p}`}
            >
              {p}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <details className="rounded-control border bg-card text-xs text-muted-foreground">
        <summary className="flex min-h-11 cursor-pointer select-none items-center px-3 py-2 font-medium text-foreground">
          What do Waiver Score and Lineup Impact mean?
        </summary>
        <dl className="mt-2 flex flex-col gap-1.5 px-3 pb-2">
          <div>
            <dt className="inline font-semibold text-foreground">Waiver Score</dt>
            <dd className="inline">
              {" "}
              a 0 to 100 score combining Lineup Impact, rest-of-season value, usage trend, Sleeper
              momentum and schedule.
            </dd>
          </div>
          <div>
            <dt className="inline font-semibold text-foreground">Lineup Impact</dt>
            <dd className="inline">
              {" "}
              projected points gained over the next 3 weeks if you added this player.
            </dd>
          </div>
        </dl>
      </details>

      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        {status === "loading" ? (
          <>
            <Loader2
              className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
              aria-hidden
            />
            Updating
          </>
        ) : (
          `${String(candidates.length)} player${candidates.length === 1 ? "" : "s"}`
        )}
      </p>

      {status === "error" ? (
        <ErrorState
          {...(error !== null ? { detail: error } : {})}
          onRetry={() => {
            runFetch(positions);
          }}
        />
      ) : candidates.length === 0 ? (
        <EmptyState
          title="No candidates match this filter"
          message="Try clearing the position filter to see more players."
          action={
            positions.length > 0 ? (
              <Button
                variant="outline"
                onClick={() => {
                  handlePositionsChange([]);
                }}
                data-testid="waivers-clear-filter"
              >
                Clear filter
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div aria-busy={status === "loading"} className={status === "loading" ? "opacity-60" : ""}>
          <CandidateCards
            candidates={candidates}
            drops={dropsMap}
            priorityByPlayer={priorityByPlayer}
          />
          <CandidateTable
            candidates={candidates}
            drops={dropsMap}
            priorityByPlayer={priorityByPlayer}
          />
        </div>
      )}
    </section>
  );
}

function CompetingBadge({
  playerName,
  reasons,
}: {
  playerName: string;
  reasons: ReturnType<typeof competingFlagReasons>;
}) {
  if (reasons.length === 0) return null;
  return (
    <WhySheet
      title={`Competing claims for ${playerName}`}
      summary={{ label: "Teams likely to compete", value: reasons.length }}
      reasons={reasons}
      trigger={
        <Button
          variant="outline"
          size="sm"
          className="gap-1 px-2 text-xs"
          data-testid="waivers-competing-badge"
        >
          <Users className="size-3.5" aria-hidden />
          {reasons.length} competing
        </Button>
      }
    />
  );
}

function ClaimBadge({
  playerName,
  priority,
}: {
  playerName: string;
  priority: WaiverPriorityCandidate | undefined;
}) {
  if (priority === undefined) return null;
  const info = claimBadgeInfo(priority.claimAdvice);
  return (
    <WhySheet
      title={`Claim advice for ${playerName}`}
      reasons={priority.claimAdvice.reasons}
      trigger={
        <Button
          variant={info.variant === "positive" ? "secondary" : "outline"}
          size="sm"
          className="px-2 text-xs"
          data-testid="waivers-claim-badge"
        >
          {info.label}
        </Button>
      }
    />
  );
}

function ScoreBreakdownTrigger({ candidate }: { candidate: WaiverCandidate }) {
  return (
    <WhySheet
      title={candidate.name}
      summary={{ label: "Waiver Score", value: formatScore(candidate.waiverScore) }}
      reasons={candidate.reasons}
    />
  );
}

/** Semantic table at 1024px and up, divided card list below (house pattern, see `StandingsList`). */
function CandidateTable({
  candidates,
  drops,
  priorityByPlayer,
}: {
  candidates: readonly WaiverCandidate[];
  drops: ReadonlyMap<string, DropPlayerInfo>;
  priorityByPlayer: ReadonlyMap<string, WaiverPriorityCandidate>;
}) {
  return (
    <div className="hidden overflow-x-auto rounded-card border bg-card lg:block">
      <table className="w-full text-sm" data-testid="waivers-table">
        <caption className="sr-only">Waiver candidates</caption>
        <thead className="border-b bg-muted text-left">
          <tr>
            <th scope="col" className="sl-label px-3 py-2">
              Player
            </th>
            <th scope="col" className="sl-label px-3 py-2 text-right">
              Score
            </th>
            <th scope="col" className="sl-label px-3 py-2 text-right">
              Lineup impact
            </th>
            <th scope="col" className="sl-label px-3 py-2 text-left">
              Trend
            </th>
            <th scope="col" className="sl-label px-3 py-2 text-left">
              Next 3 wks
            </th>
            <th scope="col" className="sl-label px-3 py-2 text-left">
              Suggested drop
            </th>
            <th scope="col" className="sl-label px-3 py-2 text-right">
              <span className="sr-only">Why</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {candidates.map((c) => {
            const meta = rowMeta(c, drops, priorityByPlayer);
            return (
              <tr key={c.playerId} data-testid="waivers-row" className="align-top hover:bg-muted">
                <td className="max-w-xs px-3 py-2">
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium" title={c.name}>
                        {c.name}
                      </span>
                      <InjuryBadge status={c.injuryStatus} />
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <PositionBadge position={c.position} />
                      <span>{c.nflTeam ?? "Free agent"}</span>
                    </span>
                    {meta.competing.length > 0 || meta.priority !== undefined ? (
                      <span className="flex flex-wrap items-center gap-1.5">
                        <CompetingBadge playerName={c.name} reasons={meta.competing} />
                        <ClaimBadge playerName={c.name} priority={meta.priority} />
                      </span>
                    ) : null}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-base font-bold tabular-nums">
                  {formatScore(c.waiverScore)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatSignedPoints(c.lineupImpact)}
                </td>
                <td className="px-3 py-2">
                  <TrendIndicator trend={meta.trend} />
                </td>
                <td className="px-3 py-2">
                  {meta.grade === null ? (
                    <span className="text-xs text-muted-foreground">No data</span>
                  ) : (
                    <MatchupGrade grade={meta.grade} compact />
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{meta.dropText}</td>
                <td className="px-3 py-2 text-right">
                  <ScoreBreakdownTrigger candidate={c} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CandidateCards({
  candidates,
  drops,
  priorityByPlayer,
}: {
  candidates: readonly WaiverCandidate[];
  drops: ReadonlyMap<string, DropPlayerInfo>;
  priorityByPlayer: ReadonlyMap<string, WaiverPriorityCandidate>;
}) {
  return (
    <ol
      className="flex flex-col divide-y rounded-card border bg-card lg:hidden"
      data-testid="waivers-cards"
    >
      {candidates.map((c) => {
        const meta = rowMeta(c, drops, priorityByPlayer);
        return (
          <li key={c.playerId} className="flex flex-col gap-2 p-3" data-testid="waivers-row">
            <div className="flex items-start justify-between gap-2">
              <span className="flex min-w-0 flex-col gap-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-base font-medium" title={c.name}>
                    {c.name}
                  </span>
                  <InjuryBadge status={c.injuryStatus} />
                </span>
                <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <PositionBadge position={c.position} />
                  <span>{c.nflTeam ?? "Free agent"}</span>
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-xl font-bold tabular-nums">
                  {formatScore(c.waiverScore)}
                </span>
                <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">
                  Score
                </span>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="font-semibold tabular-nums">
                {formatSignedPoints(c.lineupImpact)}
              </span>
              <span className="text-xs text-muted-foreground">lineup impact</span>
              <TrendIndicator trend={meta.trend} />
              {meta.grade !== null ? <MatchupGrade grade={meta.grade} compact /> : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Suggested drop: <span className="text-foreground">{meta.dropText}</span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <CompetingBadge playerName={c.name} reasons={meta.competing} />
              <ClaimBadge playerName={c.name} priority={meta.priority} />
              <ScoreBreakdownTrigger candidate={c} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
