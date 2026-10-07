"use client";

import type { Reason } from "@sideline/shared";
import { ArrowDown, ArrowUp, HelpCircle } from "lucide-react";
import {
  cloneElement,
  isValidElement,
  useEffect,
  useState,
  type ComponentType,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "../lib/client/cn";
import { formatImpact, formatProjectedPoints, formatReasonValue } from "./reason-format";
import { Button } from "./ui/button";

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
            const proj = formatProjectedPoints(r.projectedPoints);
            const value = formatReasonValue(r.value, r.code);
            return (
              <li
                key={`${i}-${r.code}`}
                className="flex items-start justify-between gap-2 py-1.5 text-sm"
              >
                <span className="min-w-0 break-words">{r.label}</span>
                <span className="flex shrink-0 items-center gap-2 text-right tabular-nums">
                  {value !== undefined ? <span className="font-medium">{value}</span> : null}
                  {proj !== undefined ? (
                    <span className="text-muted-foreground">{proj}</span>
                  ) : null}
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

let loaded: ComponentType<WhySheetProps> | undefined;

const DEFAULT_TRIGGER = (
  <Button variant="ghost" size="sm" className="min-h-11 gap-1 px-2" data-testid="why-trigger">
    <HelpCircle className="size-4" aria-hidden />
    Why?
  </Button>
);

/**
 * The sheet code (Radix dialog) loads after hydration to keep route JS small. Until then the
 * trigger renders as a plain button; a tap before the code arrives opens the sheet on load.
 */
export function WhySheet(props: WhySheetProps) {
  const [Impl, setImpl] = useState<ComponentType<WhySheetProps> | undefined>(() => loaded);
  const [tapped, setTapped] = useState(false);
  useEffect(() => {
    if (Impl) return;
    let live = true;
    void import("./why-sheet-impl").then((m) => {
      loaded = m.default;
      if (live) setImpl(() => m.default);
    });
    return () => {
      live = false;
    };
  }, [Impl]);
  if (Impl) return <Impl {...props} defaultOpen={props.defaultOpen === true || tapped} />;
  const onTap = (e: MouseEvent): void => {
    e.preventDefault();
    setTapped(true);
  };
  const trigger = props.trigger ?? DEFAULT_TRIGGER;
  return isValidElement(trigger)
    ? cloneElement(trigger as ReactElement<{ onClick?: (e: MouseEvent) => void }>, {
        onClick: onTap,
      })
    : trigger;
}
