import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { cn } from "../lib/client/cn";
import { trendLabel, type Trend } from "./trend";

const STYLE = {
  rising: { Icon: TrendingUp, cls: "text-positive" },
  steady: { Icon: Minus, cls: "text-muted-foreground" },
  falling: { Icon: TrendingDown, cls: "text-negative" },
} as const;

export interface TrendIndicatorProps {
  trend: Trend;
  /** Optional detail such as "+2.1 pts". */
  detail?: string;
  className?: string;
}

export function TrendIndicator({ trend, detail, className }: TrendIndicatorProps) {
  const { Icon, cls } = STYLE[trend];
  return (
    <span
      data-testid="trend-indicator"
      className={cn(
        "inline-flex items-center gap-1 text-sm font-medium whitespace-nowrap",
        cls,
        className,
      )}
    >
      <Icon className="size-4" aria-hidden />
      <span>{trendLabel(trend)}</span>
      {detail ? (
        <span className="tabular-nums text-xs font-normal opacity-90">{detail}</span>
      ) : null}
    </span>
  );
}
