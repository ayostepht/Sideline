import type { TradeFairness } from "@sideline/shared";
import { Check, Scale, TriangleAlert } from "lucide-react";
import { Badge } from "../../../../../components/ui/badge";
import { FAIRNESS_LABEL } from "./format";

const VARIANT = {
  fair: "positive",
  leans_you: "info",
  leans_them: "info",
  lopsided: "warning",
} as const;

/** Text label plus icon, so color is never the only signal. */
export function FairnessBadge({ fairness }: { fairness: TradeFairness }) {
  const Icon = fairness === "fair" ? Check : fairness === "lopsided" ? TriangleAlert : Scale;
  return (
    <Badge variant={VARIANT[fairness]} data-testid="trade-fairness" data-fairness={fairness}>
      <Icon className="size-3" aria-hidden />
      {FAIRNESS_LABEL[fairness]}
    </Badge>
  );
}
