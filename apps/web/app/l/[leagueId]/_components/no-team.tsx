import { UserRound } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "../../../../components/empty-state";
import { buttonVariants } from "../../../../components/ui/button";
import { leagueBase } from "../../../../lib/client/nav";

export function NoTeamState({ leagueId }: { leagueId: string }) {
  return (
    <div data-testid="no-team-state">
      <EmptyState
        icon={UserRound}
        title="We don't know which team is yours"
        message="Pick your Sleeper username in Settings and Sideline will find your team."
        action={
          <Link
            href={`${leagueBase(leagueId)}/settings`}
            className={buttonVariants({ variant: "outline" })}
            data-testid="no-team-settings-link"
          >
            Open Settings
          </Link>
        }
      />
    </div>
  );
}
