"use client";

import { Info } from "lucide-react";
import {
  type ComponentType,
  forwardRef,
  type ComponentPropsWithoutRef,
  useEffect,
  useState,
} from "react";

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

let loaded: ComponentType<InfoPopoverProps> | undefined;

/**
 * Tap-to-open explanation. Works on touch, keyboard and screen readers (Escape closes, focus
 * returns to the button). The popover code (Radix popover and positioning) loads after hydration
 * to keep route JS small; until then the button renders without behavior.
 */
export function InfoPopover(props: InfoPopoverProps) {
  const [Impl, setImpl] = useState<ComponentType<InfoPopoverProps> | undefined>(() => loaded);
  useEffect(() => {
    if (Impl) return;
    let live = true;
    void import("./info-popover-impl").then((m) => {
      loaded = m.default;
      if (live) setImpl(() => m.default);
    });
    return () => {
      live = false;
    };
  }, [Impl]);
  if (Impl) return <Impl {...props} />;
  return <InfoButton label={props.label} testid={props.testid} />;
}
