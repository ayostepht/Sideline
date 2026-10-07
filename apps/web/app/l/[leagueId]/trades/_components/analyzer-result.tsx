import type { TradeEvaluateResponse } from "@sideline/shared";
import { ErrorState } from "../../../../../components/empty-state";
import { PlayerLink } from "../../../../../components/player-link";
import { FairnessBadge } from "./fairness-badge";
import { FAIRNESS_TIP, mergeReasons } from "./format";
import { ImpactPanel } from "./impact-panel";
import { InfoTip } from "./info-tip";
import { ReasonsBlock } from "./reasons-block";

function Names({ players }: { players: TradeEvaluateResponse["give"] }) {
  return players.map((p, i) => (
    <span key={p.playerId}>
      {i > 0 ? ", " : ""}
      <PlayerLink playerId={p.playerId} className="font-medium">
        {p.name}
      </PlayerLink>
    </span>
  ));
}

export function AnalyzerErrorView({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: (() => void) | undefined;
}) {
  return (
    <div data-testid="analyzer-error">
      <ErrorState
        title="Could not evaluate this trade"
        detail={message}
        {...(onRetry ? { onRetry } : {})}
      />
    </div>
  );
}

export function AnalyzerResult({
  result,
  theirTeamName,
}: {
  result: TradeEvaluateResponse;
  theirTeamName: string;
}) {
  return (
    <section
      className="flex flex-col gap-3"
      aria-labelledby="analyzer-result-heading"
      data-testid="analyzer-result"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="analyzer-result-heading" className="text-lg font-semibold">
          Result
        </h2>
        <FairnessBadge fairness={result.fairness} />
        <InfoTip
          label="What does fairness mean?"
          text={FAIRNESS_TIP}
          testid="trade-fairness-info"
        />
      </div>
      <p className="text-sm">
        You give <Names players={result.give} />. You get <Names players={result.get} />.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <ImpactPanel
          title="Your team"
          impact={result.mine}
          possessive="Your"
          testid="analyzer-mine"
          showTip
        />
        <ImpactPanel
          title={theirTeamName}
          impact={result.theirs}
          possessive="Their"
          testid="analyzer-theirs"
        />
      </div>
      <ReasonsBlock
        reasons={mergeReasons(result.reasons, result.mine.reasons, result.theirs.reasons)}
      />
    </section>
  );
}
