import type { LineupPlayer, LineupSwap } from "@sideline/shared";
import { ArrowRight } from "lucide-react";
import { cn } from "../../../../../lib/client/cn";
import { formatSignedPoints, hasMaterialSwaps, playerById, swapDelta } from "./format";

function nameOrEmpty(players: readonly LineupPlayer[], id: string | null): string {
  if (id === null) return "Empty slot";
  return playerById(players, id)?.name ?? `Player ${id}`;
}

/**
 * The swaps to make (LINEUP-6): current starter out, optimal starter in, per slot. Hidden below
 * the same materiality floor as the summary banner's headline (`hasMaterialSwaps`), so the detail
 * list never appears underneath an "already optimal" headline.
 */
export function SwapList({
  swaps,
  players,
  pointDelta,
}: {
  swaps: readonly LineupSwap[];
  players: readonly LineupPlayer[];
  pointDelta: number;
}) {
  if (!hasMaterialSwaps(pointDelta, swaps.length)) return null;
  return (
    <section aria-labelledby="lineup-swaps-h" data-testid="lineup-swaps">
      <h2 id="lineup-swaps-h" className="sl-label sl-mark mb-1">
        Swaps to make
      </h2>
      <ul className="flex flex-col divide-y rounded-card border bg-card">
        {swaps.map((swap, i) => {
          const delta = swapDelta(players, swap);
          const outName = nameOrEmpty(players, swap.playerIdOut);
          const inName = nameOrEmpty(players, swap.playerIdIn);
          return (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: slot types can repeat (two FLEX)
              key={`${swap.slotIndex}-${swap.slotType}-${i}`}
              className="flex min-h-11 flex-col gap-1 px-3 py-2 text-sm"
              data-testid="lineup-swap-row"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="shrink-0 text-xs font-medium text-muted-foreground">
                  {swap.slotType}
                </span>
                {delta !== null ? (
                  <span
                    className={cn(
                      "shrink-0 font-semibold tabular-nums",
                      delta >= 0 ? "text-positive" : "text-negative",
                    )}
                  >
                    {formatSignedPoints(delta)}
                  </span>
                ) : null}
              </div>
              <div className="flex items-start gap-2">
                <span className="min-w-0 flex-1 whitespace-normal break-words leading-tight">
                  {outName}
                </span>
                <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 whitespace-normal break-words font-medium leading-tight">
                  {inName}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
