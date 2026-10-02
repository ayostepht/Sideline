"use client";

import { PlayerSearchResultSchema, type PlayerSearchResult } from "@sideline/shared";
import { Command } from "cmdk";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { z } from "zod";
import { normalizeSearchQuery, searchResultHref, SEARCH_DEBOUNCE_MS } from "../../lib/client/nav";
import { InjuryBadge } from "../injury-badge";
import { PositionBadge } from "../position-badge";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";

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
  const [freeAgent, setFreeAgent] = useState<PlayerSearchResult | null>(null);

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
    const href = searchResultHref(leagueId, r);
    handleOpenChange(false);
    if (href === null) setFreeAgent(r);
    else router.push(href);
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
                      className="flex min-h-12 cursor-pointer items-center gap-3 rounded-[8px] px-3 py-2 data-[selected=true]:bg-muted"
                    >
                      <PositionBadge position={r.position} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{r.name}</span>
                          <InjuryBadge status={r.injuryStatus} />
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {r.nflTeam ?? "No team"} · {r.owner?.teamName ?? "Free agent"}
                        </span>
                      </span>
                    </Command.Item>
                  ))
                : null}
            </Command.List>
          </Command>
        </DialogContent>
      </Dialog>
      <Sheet open={freeAgent !== null} onOpenChange={(o) => !o && setFreeAgent(null)}>
        <SheetContent side="bottom" data-testid="search-free-agent-sheet">
          <SheetHeader>
            <SheetTitle>{freeAgent?.name}</SheetTitle>
            <SheetDescription>Free agent</SheetDescription>
          </SheetHeader>
          {freeAgent ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <PositionBadge position={freeAgent.position} />
              <span className="text-sm">{freeAgent.nflTeam ?? "No team"}</span>
              <InjuryBadge status={freeAgent.injuryStatus} />
              {freeAgent.injuryStatus === null ? (
                <span className="text-sm text-muted-foreground">No injury designation</span>
              ) : null}
            </div>
          ) : null}
          <p className="mt-3 text-sm text-muted-foreground">Full player pages arrive soon.</p>
        </SheetContent>
      </Sheet>
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
          className="mt-1 inline-flex min-h-11 items-center px-3 text-primary underline underline-offset-4"
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
