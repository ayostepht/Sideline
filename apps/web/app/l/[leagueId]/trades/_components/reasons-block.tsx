import type { Reason } from "@sideline/shared";
import { ReasonChips } from "../../../../../components/reason-chips";

const COLLAPSE_OVER = 3;

/** Reason chips; collapsed behind a native disclosure when there are many. */
export function ReasonsBlock({ reasons }: { reasons: readonly Reason[] }) {
  if (reasons.length === 0) return null;
  if (reasons.length <= COLLAPSE_OVER) return <ReasonChips reasons={reasons} />;
  return (
    <details data-testid="trade-reasons-details">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-link">
        Why this trade ({reasons.length})
      </summary>
      <ReasonChips reasons={reasons} className="pb-1" />
    </details>
  );
}
