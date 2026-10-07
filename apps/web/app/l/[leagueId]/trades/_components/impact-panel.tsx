import type { TradeTeamImpact } from "@sideline/shared";
import { BEST_LINEUP_TIP, playoffMissingText } from "./format";
import { ImpactGrid } from "./impact-grid";
import { InfoTip } from "./info-tip";

/** One team's change: best lineup and playoff odds before, after and change, plus any auto-drops. */
export function ImpactPanel({
  title,
  impact,
  possessive,
  testid,
  showTip = false,
}: {
  title: string;
  impact: TradeTeamImpact;
  /** "Your" or "Their", used in the sentence labels. */
  possessive: "Your" | "Their";
  testid: string;
  showTip?: boolean;
}) {
  const hasPlayoff = impact.playoffPctBefore !== null && impact.playoffPctAfter !== null;
  const verb = possessive === "Your" ? "You drop" : "They drop";
  return (
    <section className="min-w-0 rounded-control border bg-card p-3" data-testid={testid}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="min-w-0 truncate text-sm font-semibold">{title}</h3>
        {showTip ? (
          <InfoTip
            label="What is best lineup (rest of season)?"
            text={BEST_LINEUP_TIP}
            testid="trade-lineup-info"
          />
        ) : null}
      </div>
      <p className="mb-1 text-xs text-muted-foreground">{possessive} best lineup, rest of season</p>
      <ImpactGrid
        caption={`${possessive} best lineup before and after`}
        impact={impact}
        testid={`${testid}-grid`}
      />
      {!hasPlayoff ? (
        <p className="mt-1 text-sm text-muted-foreground" data-testid={`${testid}-playoff`}>
          {playoffMissingText(impact.reasons)}
        </p>
      ) : null}
      {impact.dropped.length > 0 ? (
        <p className="mt-1 text-sm" data-testid={`${testid}-dropped`}>
          {verb} {impact.dropped.map((p) => p.name).join(", ")} to make room.
        </p>
      ) : null}
    </section>
  );
}
