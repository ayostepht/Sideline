"use client";

import type { PlayersListResponse } from "@sideline/shared";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { EmptyState, ErrorState } from "../../../../../components/empty-state";
import { PlayerRowSkeleton, TableSkeleton } from "../../../../../components/skeletons";
import { Button } from "../../../../../components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "../../../../../components/ui/toggle-group";
import { apiJson } from "../../../../../lib/client/api";
import { SEARCH_DEBOUNCE_MS } from "../../../../../lib/client/nav";
import {
  buildPlayersHref,
  normalizePlayersQuery,
  PLAYERS_PAGE_SIZE,
  POSITION_FILTERS,
  type PositionFilter,
} from "./format";
import { PlayersList } from "./players-list";

type Status = "idle" | "loading" | "error";

const ALL_VALUE = "ALL";

function requestKey(position: PositionFilter | undefined, q: string | undefined, page: number) {
  return `${position ?? ""}|${q ?? ""}|${page}`;
}

/** `apiJson` dynamically imports its zod schemas, so this route's first-load JS stays small (see
 * `lib/client/schemas.ts`); a plain `fetch` plus a statically-imported schema would ship zod in
 * the initial bundle instead. */
function fetchPlayers(
  leagueId: string,
  opts: { position: PositionFilter | undefined; q: string | undefined; page: number },
  signal: AbortSignal,
) {
  const params = new URLSearchParams();
  params.set("page", String(opts.page));
  params.set("pageSize", String(PLAYERS_PAGE_SIZE));
  if (opts.position !== undefined) params.set("position", opts.position);
  if (opts.q !== undefined) params.set("q", opts.q);
  return apiJson(
    `/api/l/${encodeURIComponent(leagueId)}/players?${params.toString()}`,
    "PlayersListResponseSchema",
    { signal },
  );
}

export interface PlayersExplorerProps {
  leagueId: string;
  initialData: PlayersListResponse;
  initialPosition: PositionFilter | undefined;
  initialQuery: string | undefined;
  initialPage: number;
}

/**
 * T4.6b (PLAN 6.4): client-owned search, position filter, and pagination for the players list.
 * Reuses `search-dialog.tsx`'s debounced-fetch-plus-zod-parse pattern against the real
 * `GET /api/l/[leagueId]/players` route: the server component renders the first page, every
 * filter or page change after that refetches here and syncs the URL via `window.history.replaceState`
 * (not `next/navigation`'s router, which would re-render the page's Server Component and re-run
 * `getPlayersList` a second time on every interaction, see Waivers' `WaiverBoard` for the same
 * pattern) so the view stays deep-linkable and shareable without a full page reload.
 */
export function PlayersExplorer({
  leagueId,
  initialData,
  initialPosition,
  initialQuery,
  initialPage,
}: PlayersExplorerProps) {
  const searchId = useId();
  const [position, setPosition] = useState<PositionFilter | undefined>(initialPosition);
  const [queryInput, setQueryInput] = useState(initialQuery ?? "");
  const [page, setPage] = useState(initialPage);
  const [data, setData] = useState(initialData);
  const [status, setStatus] = useState<Status>("idle");
  const [nonce, setNonce] = useState(0);
  const initialKey = useRef(requestKey(initialPosition, initialQuery, initialPage));
  const didRunOnce = useRef(false);

  useEffect(() => {
    const q = normalizePlayersQuery(queryInput);
    const key = requestKey(position, q, page);
    const isFirstRun = !didRunOnce.current;
    didRunOnce.current = true;
    if (isFirstRun && nonce === 0 && key === initialKey.current) return;

    const ctrl = new AbortController();
    setStatus("loading");
    const timer = setTimeout(() => {
      fetchPlayers(leagueId, { position, q, page }, ctrl.signal)
        .then((outcome) => {
          if (ctrl.signal.aborted) return; // superseded by a newer request; ignore
          if (!outcome.ok) {
            setStatus("error");
            return;
          }
          setData(outcome.data);
          setStatus("idle");
          window.history.replaceState(null, "", buildPlayersHref(leagueId, { page, position, q }));
        })
        .catch(() => {
          if (!ctrl.signal.aborted) setStatus("error");
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [position, queryInput, page, nonce]);

  function changePosition(next: PositionFilter | undefined) {
    setPosition(next);
    setPage(1);
  }

  function changeQuery(next: string) {
    setQueryInput(next);
    setPage(1);
  }

  function clearFilters() {
    setPosition(undefined);
    setQueryInput("");
    setPage(1);
  }

  const activeQuery = normalizePlayersQuery(queryInput);
  const hasActiveFilters = position !== undefined || activeQuery !== undefined;
  const loading = status === "loading";
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="flex flex-col gap-3" data-testid="players-explorer">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <label htmlFor={searchId} className="sr-only">
            Search players by name
          </label>
          <input
            id={searchId}
            type="search"
            value={queryInput}
            onChange={(e) => changeQuery(e.target.value)}
            placeholder="Search players"
            autoComplete="off"
            data-testid="players-search-input"
            className="min-h-11 w-full rounded-control border border-input bg-card pl-9 pr-3 text-base text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <ToggleGroup
          type="single"
          value={position ?? ALL_VALUE}
          onValueChange={(v) =>
            changePosition(v === "" || v === ALL_VALUE ? undefined : (v as PositionFilter))
          }
          aria-label="Filter by position"
          data-testid="players-position-filter"
          className="flex-wrap"
        >
          <ToggleGroupItem value={ALL_VALUE} data-testid="players-position-filter-all">
            All
          </ToggleGroupItem>
          {POSITION_FILTERS.map((pos) => (
            <ToggleGroupItem
              key={pos}
              value={pos}
              data-testid={`players-position-filter-${pos.toLowerCase()}`}
            >
              {pos}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {status === "loading"
          ? "Loading players"
          : status === "error"
            ? "Could not load players"
            : `${data.total} ${data.total === 1 ? "player" : "players"} found`}
      </p>
      {status === "error" ? (
        <div className="rounded-card border bg-card">
          <ErrorState
            title="Couldn't load players"
            detail="Check your connection and try again."
            onRetry={() => setNonce((n) => n + 1)}
          />
        </div>
      ) : loading ? (
        <>
          <PlayerRowSkeleton count={6} className="rounded-card border bg-card lg:hidden" />
          <TableSkeleton className="hidden rounded-card border bg-card p-3 lg:flex" />
        </>
      ) : data.players.length === 0 ? (
        <div className="rounded-card border bg-card">
          <EmptyState
            icon={Search}
            title="No players match"
            message={
              hasActiveFilters
                ? "Try a different search or clear your filters."
                : "No players found for this league."
            }
            action={
              hasActiveFilters ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearFilters}
                  data-testid="players-clear-filters"
                >
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <PlayersList leagueId={leagueId} players={data.players} />
      )}
      {data.total > 0 ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2"
          data-testid="players-pagination"
        >
          <p className="text-sm tabular-nums text-muted-foreground">{data.total} players</p>
          <div className="flex items-center gap-1" role="group" aria-label="Pagination">
            <button
              type="button"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-control text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              aria-label="Previous page"
              data-testid="players-page-prev"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <span className="px-1 text-sm tabular-nums" data-testid="players-page-label">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-control text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent"
              onClick={() => setPage((p) => p + 1)}
              disabled={!data.hasMore || loading}
              aria-label="Next page"
              data-testid="players-page-next"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
