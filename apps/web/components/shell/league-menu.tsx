"use client";

import type { LeagueChoice } from "@sideline/shared";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { cn } from "../../lib/client/cn";
import { leagueBase } from "../../lib/client/nav";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../ui/sheet";

function LeagueList({
  leagueId,
  leagues,
  onDone,
}: {
  leagueId: string;
  leagues: readonly LeagueChoice[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(id: string) {
    if (id === leagueId) {
      onDone();
      return;
    }
    setPending(id);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/league", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leagueId: id }),
      });
      if (!res.ok) throw new Error("switch failed");
      onDone();
      router.push(leagueBase(id));
    } catch {
      setError("Could not switch leagues. Try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <ul className="flex flex-col gap-1" aria-label="Leagues">
        {leagues.map((l) => {
          const current = l.leagueId === leagueId;
          return (
            <li key={l.leagueId}>
              <button
                type="button"
                disabled={pending !== null}
                onClick={() => void choose(l.leagueId)}
                aria-current={current ? "true" : undefined}
                data-testid="league-switcher-option"
                className={cn(
                  "flex min-h-11 w-full items-center gap-2 rounded-[8px] px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-60",
                  current ? "font-semibold" : "",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{l.name}</span>
                  <span className="block text-xs font-normal tabular-nums text-muted-foreground">
                    {l.season} · {l.totalRosters} teams
                    {pending === l.leagueId ? " · Switching" : ""}
                  </span>
                </span>
                {current ? <Check className="size-4 shrink-0" aria-label="Current league" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
      {error ? (
        <p role="alert" data-testid="league-switcher-error" className="mt-2 text-sm text-negative">
          {error}
        </p>
      ) : null}
    </>
  );
}

/** Loaded on first click of the league button (keeps Radix popper and dialog out of the initial JS). */
export default function LeagueMenu({
  leagueId,
  leagues,
  variant,
  trigger,
}: {
  leagueId: string;
  leagues: readonly LeagueChoice[];
  variant: "popover" | "sheet";
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  if (variant === "popover") {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent className="w-64 p-2">
          <LeagueList leagueId={leagueId} leagues={leagues} onDone={() => setOpen(false)} />
        </PopoverContent>
      </Popover>
    );
  }
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Switch league</SheetTitle>
          <SheetDescription>Pick the league to show.</SheetDescription>
        </SheetHeader>
        <div className="mt-2">
          <LeagueList leagueId={leagueId} leagues={leagues} onDone={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
