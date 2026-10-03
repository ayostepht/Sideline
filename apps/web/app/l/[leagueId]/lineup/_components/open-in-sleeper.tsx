import { ExternalLink } from "lucide-react";
import { Button } from "../../../../../components/ui/button";

/** Hands off the actual swap to Sleeper's own app. Only shown for the viewer's own roster. */
export function OpenInSleeperButton({ leagueId }: { leagueId: string }) {
  return (
    <Button asChild variant="outline" className="self-start" data-testid="lineup-open-in-sleeper">
      <a
        href={`https://sleeper.com/leagues/${encodeURIComponent(leagueId)}`}
        target="_blank"
        rel="noreferrer"
      >
        <ExternalLink className="size-4 shrink-0" aria-hidden />
        Open in Sleeper
        <span className="sr-only">. Opens Sleeper&apos;s own app to make the swap.</span>
      </a>
    </Button>
  );
}
