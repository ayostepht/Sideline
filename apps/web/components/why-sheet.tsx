"use client";

import type { Reason } from "@sideline/shared";
import { ArrowDown, ArrowUp, HelpCircle } from "lucide-react";
import {
  cloneElement,
  isValidElement,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "../lib/client/cn";
import { createLazyLoader, useLazyModule } from "../lib/client/lazy-module";
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

const loader = createLazyLoader(() => import("./why-sheet-impl"));

const DEFAULT_TRIGGER = (
  <Button variant="ghost" size="sm" className="min-h-11 gap-1 px-2" data-testid="why-trigger">
    <HelpCircle className="size-4" aria-hidden />
    Why?
  </Button>
);

type TriggerProps = { onClick?: (e: MouseEvent) => void; "aria-expanded"?: boolean };

/**
 * The sheet code (Radix dialog) loads after hydration to keep route JS small. Until then the
 * trigger renders as a plain button; a tap before the code arrives opens the sheet on load (and
 * reports `onOpenChange(true)` in controlled mode). Focus on the trigger is kept across the swap.
 * If the code fails to load, a tap expands the numbers inline instead.
 */
export function WhySheet(props: WhySheetProps) {
  const host = useRef<HTMLSpanElement>(null);
  const hadFocus = useRef(false);
  const [tapped, setTapped] = useState(false);
  const { mod, failed } = useLazyModule(loader, {
    onBeforeSwap: () => {
      hadFocus.current = host.current?.contains(document.activeElement) ?? false;
    },
  });
  useLayoutEffect(() => {
    if (mod && hadFocus.current && !tapped) {
      host.current?.querySelector<HTMLElement>("button, a, [role=button]")?.focus();
    }
    hadFocus.current = false;
  }, [mod, tapped]);

  let body: ReactNode;
  if (mod) {
    const Impl = mod.default;
    body = <Impl {...props} defaultOpen={props.defaultOpen === true || tapped} />;
  } else {
    const trigger = props.trigger ?? DEFAULT_TRIGGER;
    const onTap = (e: MouseEvent): void => {
      (isValidElement(trigger) ? (trigger.props as TriggerProps).onClick : undefined)?.(e);
      if (failed) {
        setTapped((t) => !t);
        return;
      }
      setTapped(true);
      props.onOpenChange?.(true);
    };
    const triggerEl = isValidElement(trigger)
      ? cloneElement(trigger as ReactElement<TriggerProps>, {
          onClick: onTap,
          ...(failed ? { "aria-expanded": tapped } : {}),
        })
      : trigger;
    body = (
      <>
        {triggerEl}
        {failed && tapped ? (
          <div role="region" aria-label={props.title} data-testid="why-inline">
            <WhyBody summary={props.summary} reasons={props.reasons} />
          </div>
        ) : null}
      </>
    );
  }
  return (
    <span ref={host} className="contents">
      {body}
    </span>
  );
}
