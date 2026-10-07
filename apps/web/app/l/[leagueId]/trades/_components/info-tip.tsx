"use client";

import { Info } from "lucide-react";
import { Tooltip } from "../../../../../components/ui/tooltip";

/** Small info button with a tooltip; the text is also the accessible name's description. */
export function InfoTip({ label, text, testid }: { label: string; text: string; testid?: string }) {
  return (
    <Tooltip content={text}>
      <button
        type="button"
        aria-label={label}
        title={text}
        data-testid={testid}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-control text-muted-foreground hover:bg-muted"
      >
        <Info className="size-4" aria-hidden />
      </button>
    </Tooltip>
  );
}
