"use client";

import type { Reason } from "@sideline/shared";
import { ArrowDown, ArrowUp, HelpCircle } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "../lib/client/cn";
import { formatImpact } from "./reason-format";
import { Button } from "./ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";

export interface WhyBodyProps {
  summary?: { label: string; value: string | number } | undefined;
  reasons: ReadonlyArray<Reason>;
}

/** Sheet body. Also renderable on its own (gallery, screenshots). */
export function WhyBody({ summary, reasons }: WhyBodyProps) {
  return (
    <div className="flex flex-col gap-2 py-1" data-testid="why-body">
      {summary ? (
        <div className="rounded-control bg-accent-soft p-3">
          <div className="text-xs text-muted-foreground">{summary.label}</div>
          <div className="text-2xl font-semibold tabular-nums">{summary.value}</div>
        </div>
      ) : null}
      {reasons.length === 0 ? (
        <p className="text-sm text-muted-foreground">No detailed reasons for this one.</p>
      ) : (
        <ul className="flex flex-col divide-y" aria-label="Reasons">
          {reasons.map((r, i) => {
            const imp = formatImpact(r.impact);
            return (
              <li
                key={`${i}-${r.code}`}
                className="flex items-start justify-between gap-2 py-1.5 text-sm"
              >
                <span className="min-w-0 break-words">{r.label}</span>
                <span className="flex shrink-0 items-center gap-2 text-right tabular-nums">
                  {r.value !== undefined ? <span className="font-medium">{r.value}</span> : null}
                  {imp.sign !== "none" ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-0.5",
                        imp.sign === "up" ? "text-positive" : "text-negative",
                      )}
                    >
                      {imp.sign === "up" ? (
                        <ArrowUp className="size-3" aria-hidden />
                      ) : (
                        <ArrowDown className="size-3" aria-hidden />
                      )}
                      <span aria-hidden>{imp.text}</span>
                      <span className="sr-only">{imp.spoken}</span>
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export interface WhySheetProps extends WhyBodyProps {
  title: string;
  /** Custom trigger. Defaults to a "Why?" button. Must accept a ref (use a Button). */
  trigger?: ReactNode;
  /** Controlled open state (optional). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
}

export function WhySheet({
  title,
  summary,
  reasons,
  trigger,
  open,
  onOpenChange,
  defaultOpen,
}: WhySheetProps) {
  const [inner, setInner] = useState(defaultOpen ?? false);
  const descId = useId();
  const isOpen = open ?? inner;
  return (
    <Sheet
      open={isOpen}
      onOpenChange={(o) => {
        setInner(o);
        onOpenChange?.(o);
      }}
    >
      <SheetTrigger asChild>
        {trigger ?? (
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11 gap-1 px-2"
            data-testid="why-trigger"
          >
            <HelpCircle className="size-4" aria-hidden />
            Why?
          </Button>
        )}
      </SheetTrigger>
      <SheetContent aria-describedby={descId} data-testid="why-sheet">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription id={descId}>The numbers behind this pick.</SheetDescription>
        </SheetHeader>
        <WhyBody summary={summary} reasons={reasons} />
      </SheetContent>
    </Sheet>
  );
}
