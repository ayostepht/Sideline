import type { Reason } from "@sideline/shared";
import { CircleAlert, CircleCheck } from "lucide-react";

/** LINEUP-1/LINEUP-6 issues (unknown slot types, empty slots, inactive starters), icon plus text. */
export function LineupIssuesBanner({ issues }: { issues: readonly Reason[] }) {
  if (issues.length === 0) {
    return (
      <p
        className="flex items-center gap-2 text-sm font-semibold text-positive"
        data-testid="lineup-issues-empty"
      >
        <CircleCheck className="size-5 shrink-0" aria-hidden />
        No lineup issues this week
      </p>
    );
  }
  return (
    <div
      className="flex flex-col gap-1 rounded-card border bg-warning-soft px-3 py-2"
      data-testid="lineup-issues-banner"
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-warning">
        <CircleAlert className="size-5 shrink-0" aria-hidden />
        {issues.length === 1 ? "1 lineup issue" : `${issues.length} lineup issues`}
      </p>
      <ul className="flex flex-col gap-1 pl-7 text-sm text-foreground">
        {issues.map((issue, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: codes can repeat (e.g. two EMPTY_SLOT)
          <li key={`${issue.code}-${i}`} data-testid="lineup-issue-row">
            {issue.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
