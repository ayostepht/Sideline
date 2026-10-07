"use client";

import { type ComponentType, type ReactNode, useEffect, useState } from "react";

type TooltipProps = { content: ReactNode; children: ReactNode };

let loaded: ComponentType<TooltipProps> | undefined;

/**
 * Same API as `Tooltip`, but the Radix tooltip code loads after hydration so it stays out of the
 * route's first-load JS. Until then the children render as they are, without the tooltip.
 */
export function LazyTooltip({ content, children }: TooltipProps) {
  const [Impl, setImpl] = useState<ComponentType<TooltipProps> | undefined>(() => loaded);
  useEffect(() => {
    if (Impl) return;
    let live = true;
    void import("./tooltip").then((m) => {
      loaded = m.Tooltip;
      if (live) setImpl(() => m.Tooltip);
    });
    return () => {
      live = false;
    };
  }, [Impl]);
  if (Impl) return <Impl content={content}>{children}</Impl>;
  return <>{children}</>;
}
