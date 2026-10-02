"use client";

import { useSearchParams } from "next/navigation";
import { parseWeek } from "../../lib/client/nav";

/** The explicit ?week= value (1 to 18) or null. Nav links keep it. */
export function useExplicitWeek(): number | null {
  return parseWeek(useSearchParams().get("week"));
}
