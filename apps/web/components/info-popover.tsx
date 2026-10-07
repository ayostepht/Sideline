"use client";

import { Info } from "lucide-react";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createLazyLoader, useLazyModule } from "../lib/client/lazy-module";

type InfoPopoverProps = { label: string; text: string; testid?: string };

/** The 44 x 44 px trigger. Also used as the placeholder until the popover code has loaded. */
export const InfoButton = forwardRef<
  HTMLButtonElement,
  { label: string; testid?: string | undefined } & ComponentPropsWithoutRef<"button">
>(function InfoButton({ label, testid, ...rest }, ref) {
  return (
    <button
      {...rest}
      ref={ref}
      type="button"
      aria-label={label}
      data-testid={testid}
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-control text-muted-foreground hover:bg-muted"
    >
      <Info className="size-4" aria-hidden />
    </button>
  );
});

const loader = createLazyLoader(() => import("./info-popover-impl"));

/** No-JS-chunk fallback when the popover code fails to load: the text expands inline. */
export function InfoPopoverFallback({ label, text, testid }: InfoPopoverProps) {
  const [open, setOpen] = useState(false);
  return (
    <span className="inline-flex flex-wrap items-center">
      <InfoButton
        label={label}
        testid={testid}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      />
      {open ? (
        <span
          role="note"
          className="basis-full rounded-control border bg-muted p-2 text-sm"
          data-testid={testid ? `${testid}-content` : undefined}
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Tap-to-open explanation. Works on touch, keyboard and screen readers (Escape closes, focus
 * returns to the button). The popover code (Radix popover and positioning) loads on first hover, focus
 * or touch to keep route JS small. A tap before it arrives opens the popover on load, and focus on the
 * button is kept across the swap. If the code fails to load, the text expands inline instead.
 */
export function InfoPopover(props: InfoPopoverProps) {
  const host = useRef<HTMLSpanElement>(null);
  const hadFocus = useRef(false);
  const [tapped, setTapped] = useState(false);
  // Load on intent (hover, focus, touch) so pages that never open it do not download the code.
  const [intent, setIntent] = useState(false);
  const { mod, failed } = useLazyModule(loader, {
    enabled: intent || tapped,
    onBeforeSwap: () => {
      hadFocus.current = host.current?.contains(document.activeElement) ?? false;
    },
  });
  useLayoutEffect(() => {
    if (mod && hadFocus.current && !tapped) host.current?.querySelector("button")?.focus();
    hadFocus.current = false;
  }, [mod, tapped]);
  let body: ReactNode;
  if (mod) {
    const Impl = mod.default;
    body = <Impl {...props} defaultOpen={tapped} />;
  } else if (failed) {
    body = <InfoPopoverFallback {...props} />;
  } else {
    body = (
      <InfoButton
        label={props.label}
        testid={props.testid}
        aria-haspopup="dialog"
        aria-expanded={false}
        onPointerEnter={() => setIntent(true)}
        onPointerDown={() => setIntent(true)}
        onFocus={() => setIntent(true)}
        onClick={() => setTapped(true)}
      />
    );
  }
  return (
    <span ref={host} className="inline-flex">
      {body}
    </span>
  );
}
