"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { MAX_WEEK, resolveWeek, stepWeek, withWeekParam } from "../../lib/client/nav";

const WeekMenu = lazy(() => import("./week-menu"));
const iconBtn =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-[8px] text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent";

export function WeekSelector({ currentWeek }: { currentWeek: number | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [armed, setArmed] = useState(false);
  const week = resolveWeek(params.get("week"), currentWeek);
  // Latest requested week. Updated on click so fast double clicks stack before the URL catches up.
  const requested = useRef<number | null>(week);
  useEffect(() => {
    requested.current = week;
  }, [week]);

  if (week === null) {
    return (
      <div
        data-testid="week-selector"
        aria-disabled="true"
        className="inline-flex min-h-11 items-center rounded-[8px] px-3 text-sm text-muted-foreground"
      >
        Preseason
      </div>
    );
  }

  const go = (next: number) => {
    if (next < 1 || next > MAX_WEEK) return;
    requested.current = next;
    router.replace(`${pathname}?${withWeekParam(params.toString(), next)}`, { scroll: false });
  };

  const step = (delta: number) => {
    const next = stepWeek(requested.current ?? week, delta);
    if (next !== null) go(next);
  };

  const trigger = (
    <button
      type="button"
      data-testid="week-menu"
      aria-label={`Week ${week}, choose week`}
      onClick={() => setArmed(true)}
      className="inline-flex min-h-11 min-w-[4.5rem] items-center justify-center rounded-[8px] px-2 text-sm font-semibold tabular-nums hover:bg-muted"
    >
      Week {week}
    </button>
  );

  return (
    <div
      data-testid="week-selector"
      role="group"
      aria-label="Week"
      className="inline-flex items-center"
    >
      <button
        type="button"
        className={iconBtn}
        onClick={() => step(-1)}
        disabled={week <= 1}
        aria-label="Previous week"
        data-testid="week-prev"
      >
        <ChevronLeft className="size-5" aria-hidden />
      </button>
      {armed ? (
        <Suspense fallback={trigger}>
          <WeekMenu week={week} trigger={trigger} onPick={go} />
        </Suspense>
      ) : (
        trigger
      )}
      <button
        type="button"
        className={iconBtn}
        onClick={() => step(1)}
        disabled={week >= MAX_WEEK}
        aria-label="Next week"
        data-testid="week-next"
      >
        <ChevronRight className="size-5" aria-hidden />
      </button>
    </div>
  );
}
