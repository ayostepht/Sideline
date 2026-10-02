import { ClipboardList } from "lucide-react";
import { StubPage } from "../../../../components/shell/stub-page";

export default async function Page({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  return (
    <StubPage
      leagueId={leagueId}
      title="Lineup"
      emptyTitle="Lineup advice is coming soon"
      message="Your best lineup and the swaps to make will show up here."
      icon={ClipboardList}
    />
  );
}
