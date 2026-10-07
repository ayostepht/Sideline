"use client";

import type { ReactNode } from "react";
import { createLazyLoader, useLazyModule } from "../../lib/client/lazy-module";

type TooltipProps = { content: ReactNode; children: ReactNode };

const loader = createLazyLoader(() => import("./tooltip"));

/**
 * Same API as `Tooltip`, but the Radix tooltip code loads after hydration so it stays out of the
 * route's first-load JS. Until then (or if loading fails) the children render without the tooltip.
 */
export function LazyTooltip({ content, children }: TooltipProps) {
  const { mod } = useLazyModule(loader);
  if (mod) return <mod.Tooltip content={content}>{children}</mod.Tooltip>;
  return <>{children}</>;
}
