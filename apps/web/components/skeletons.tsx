import type { ReactNode } from "react";
import { cn } from "../lib/client/cn";
import { Card } from "./ui/card";

function Busy({
  className,
  children,
  testid,
}: {
  className?: string;
  children: ReactNode;
  testid: string;
}) {
  return (
    <div aria-busy="true" className={className} data-testid={testid}>
      <span className="sr-only">Loading</span>
      {children}
    </div>
  );
}

const bar = (cls: string) => <div className={cn("sl-skeleton", cls)} aria-hidden />;

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("flex flex-col gap-2 p-3", className)}>
      <Busy testid="skeleton-card">
        <div className="flex flex-col gap-2" aria-hidden>
          {bar("h-4 w-1/3")}
          {bar("h-6 w-2/3")}
          {bar("h-4 w-full")}
        </div>
      </Busy>
    </Card>
  );
}

export function PlayerRowSkeleton({
  count = 5,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <Busy testid="skeleton-player-rows" className={cn("flex flex-col", className)}>
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
        <div key={i} className="flex min-h-11 items-center gap-2 px-2 py-1" aria-hidden>
          {bar("h-4 w-9 shrink-0")}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {bar("h-4 w-2/3")}
            {bar("h-3 w-1/3")}
          </div>
          {bar("h-5 w-10 shrink-0")}
        </div>
      ))}
    </Busy>
  );
}

export function TableSkeleton({
  rows = 6,
  cols = 4,
  className,
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <Busy testid="skeleton-table" className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: rows }, (_, r) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
        <div key={r} className="flex gap-2" aria-hidden>
          {Array.from({ length: cols }, (_, c) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
            <div key={c} className={cn("sl-skeleton h-5", c === 0 ? "flex-[2]" : "flex-1")} />
          ))}
        </div>
      ))}
    </Busy>
  );
}

export function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("p-3", className)}>
      <Busy testid="skeleton-stat-card">
        <div className="flex flex-col gap-2" aria-hidden>
          {bar("h-3 w-1/3")}
          {bar("h-8 w-1/2")}
          {bar("h-3 w-2/3")}
        </div>
      </Busy>
    </Card>
  );
}
