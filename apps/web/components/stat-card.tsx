import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { cn } from "../lib/client/cn";
import { Card } from "./ui/card";

export interface StatCardProps {
  label: string;
  value: string | number;
  sublabel?: string;
  /** Signed change. Shown with a direction icon and text such as "+2.4". */
  delta?: { value: number; label?: string; text?: string };
  loading?: boolean;
  className?: string;
}

function formatDelta(v: number): string {
  const abs = Math.abs(v).toFixed(1);
  return v > 0 ? `+${abs}` : v < 0 ? `-${abs}` : abs;
}

export function StatCard({
  label,
  value,
  sublabel,
  delta,
  loading = false,
  className,
}: StatCardProps) {
  if (loading) {
    return (
      <Card className={cn("p-4", className)} data-testid="stat-card" aria-busy="true">
        <div className="sl-skeleton h-4 w-20" />
        <div className="sl-skeleton mt-3 h-8 w-28" />
        <div className="sl-skeleton mt-2 h-4 w-16" />
        <span className="sr-only">Loading {label}</span>
      </Card>
    );
  }
  const dir = delta ? (delta.value > 0 ? "up" : delta.value < 0 ? "down" : "flat") : null;
  const Icon = dir === "up" ? ArrowUp : dir === "down" ? ArrowDown : Minus;
  const dirCls =
    dir === "up" ? "text-positive" : dir === "down" ? "text-negative" : "text-muted-foreground";
  const dirWord = dir === "up" ? "Up" : dir === "down" ? "Down" : "No change";
  return (
    <Card className={cn("p-4", className)} data-testid="stat-card">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold leading-9 tabular-nums">{value}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-sm">
        {delta ? (
          <span className={cn("inline-flex items-center gap-1 font-medium tabular-nums", dirCls)}>
            <Icon className="size-4" aria-hidden />
            <span className="sr-only">{dirWord} </span>
            {delta.text ?? formatDelta(delta.value)}
            {delta.label ? <span className="sr-only"> {delta.label}</span> : null}
          </span>
        ) : null}
        {sublabel ? <span className="text-muted-foreground">{sublabel}</span> : null}
        {delta?.label ? (
          <span className="text-muted-foreground" aria-hidden>
            {delta.label}
          </span>
        ) : null}
      </div>
    </Card>
  );
}
