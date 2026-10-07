"use client";

import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

/**
 * Tap-to-open explanation. Works on touch, keyboard and screen readers (Escape closes, focus
 * returns to the button). The trigger is a 44 x 44 px target.
 */
export function InfoPopover({
  label,
  text,
  testid,
}: {
  label: string;
  text: string;
  testid?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          data-testid={testid}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-control text-muted-foreground hover:bg-muted"
        >
          <Info className="size-4" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent data-testid={testid ? `${testid}-content` : undefined}>{text}</PopoverContent>
    </Popover>
  );
}
