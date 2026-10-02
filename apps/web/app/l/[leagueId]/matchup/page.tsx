import { Swords } from "lucide-react";
import { StubPage } from "../../../../components/shell/stub-page";

export default async function Page({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  return (
    <StubPage
      leagueId={leagueId}
      title="Matchup"
      emptyTitle="Win probability arrives later"
      message="Your weekly matchup and its odds will show up here."
      icon={Swords}
    />
  );
}
