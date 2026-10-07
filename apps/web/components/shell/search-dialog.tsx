"use client";

import { PlayerSearchResultSchema, type PlayerSearchResult } from "@sideline/shared";
import { Command } from "cmdk";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { z } from "zod";
import { normalizeSearchQuery, searchResultHref, SEARCH_DEBOUNCE_MS } from "../../lib/client/nav";
import { InjuryBadge } from "../injury-badge";
import { teamLabel } from "../team-label";
import { PositionBadge } from "../position-badge";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";

type SearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "done"; results: PlayerSearchResult[] };

const ResultsSchema = z.array(PlayerSearchResultSchema);

interface Props {
  leagueId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SearchDialog({ leagueId, open, onOpenChange }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SearchState>({ kind: "idle" });

  useEffect(() => {
    const q = normalizeSearchQuery(query);
    if (q === null) {
      setState({ kind: "idle" });
      return;
    }
    const ctrl = new AbortController();
    setState({ kind: "loading" });
    const timer = setTimeout(() => {
      fetch(`/api/l/${encodeURIComponent(leagueId)}/search?q=${encodeURIComponent(q)}&limit=10`, {
        signal: ctrl.signal,
      })
        .then(async (res) => {
          if (!res.ok) throw new Error("search failed");
          const parsed = ResultsSchema.safeParse(await res.json());
          if (!parsed.success) throw new Error("bad response");
          setState({ kind: "done", results: parsed.data });
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setState({ kind: "error" });
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, leagueId, attempt]);

  function handleOpenChange(o: boolean) {
    onOpenChange(o);
    if (!o) {
      setQuery("");
      setState({ kind: "idle" });
    }
  }

  function select(r: PlayerSearchResult) {
    handleOpenChange(false);
    router.push(searchResultHref(leagueId, r));
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          data-testid="search-dialog"
          className="top-[12vh] max-w-lg translate-y-0 p-0"
        >
          <DialogTitle className="sr-only">Search players</DialogTitle>
          <DialogDescription className="sr-only">
            Type at least 2 letters. Use the arrow keys to pick a player.
          </DialogDescription>
          <Command shouldFilter={false} label="Search players" loop>
            <div className="flex items-center gap-2 border-b px-4">
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Search players"
                aria-label="Search players"
                data-testid="search-input"
                className="min-h-12 w-full bg-transparent pr-10 text-base outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Command.List className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
              <Status state={state} query={query} onRetry={() => setAttempt((n) => n + 1)} />
              {state.kind === "done"
                ? state.results.map((r) => (
                    <Command.Item
                      key={r.playerId}
                      value={r.playerId}
                      onSelect={() => select(r)}
                      data-testid="search-result"
                      className="flex min-h-12 cursor-pointer items-center gap-2 rounded-control px-3 py-1 data-[selected=true]:bg-muted"
                    >
                      <PositionBadge position={r.position} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{r.name}</span>
                          <InjuryBadge status={r.injuryStatus} />
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {teamLabel(r.position, r.nflTeam)
                            ? `${teamLabel(r.position, r.nflTeam)} · `
                            : ""}
                          {r.owner?.teamName ?? "Free agent"}
                        </span>
                      </span>
                    </Command.Item>
                  ))
                : null}
            </Command.List>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Status({
  state,
  query,
  onRetry,
}: {
  state: SearchState;
  query: string;
  onRetry: () => void;
}) {
  const cls = "px-3 py-6 text-center text-sm text-muted-foreground";
  if (state.kind === "idle") {
    return (
      <p className={cls} data-testid="search-hint">
        {query.trim().length === 0 ? "Search by player name." : "Type at least 2 letters."}
      </p>
    );
  }
  if (state.kind === "loading") {
    return (
      <p className={cls} role="status" data-testid="search-loading">
        Searching
      </p>
    );
  }
  if (state.kind === "error") {
    return (
      <div className={cls} role="alert" data-testid="search-error">
        <p>Search failed.</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 inline-flex min-h-11 items-center px-3 text-link underline underline-offset-4"
        >
          Retry
        </button>
      </div>
    );
  }
  if (state.results.length === 0) {
    return (
      <p className={cls} role="status" data-testid="search-empty">
        No players found.
      </p>
    );
  }
  return null;
}
