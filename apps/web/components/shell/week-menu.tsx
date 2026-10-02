"use client";

import { useState, type ReactNode } from "react";
import { cn } from "../../lib/client/cn";
import { MAX_WEEK } from "../../lib/client/nav";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

const WEEKS = Array.from({ length: MAX_WEEK }, (_, i) => i + 1);

/** Loaded on first click of the week button (keeps Radix popper out of the initial JS). */
export default function WeekMenu({
  week,
  trigger,
  onPick,
}: {
  week: number;
  trigger: ReactNode;
  onPick: (w: number) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <ul className="grid grid-cols-4 gap-1" aria-label="Weeks">
          {WEEKS.map((w) => (
            <li key={w}>
              <button
                type="button"
                onClick={() => {
                  onPick(w);
                  setOpen(false);
                }}
                aria-current={w === week ? "true" : undefined}
                data-testid={`week-option-${w}`}
                className={cn(
                  "flex min-h-11 w-full items-center justify-center rounded-control text-sm tabular-nums hover:bg-muted",
                  w === week
                    ? "bg-primary font-semibold text-primary-foreground hover:bg-primary"
                    : "",
                )}
              >
                {w}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
