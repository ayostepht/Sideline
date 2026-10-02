import { UserPlus } from "lucide-react";
import { StubPage } from "../../../../components/shell/stub-page";

export default async function Page({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  return (
    <StubPage
      leagueId={leagueId}
      title="Waivers"
      emptyTitle="Waiver tools arrive soon"
      message="Pickup targets and drop suggestions will show up here."
      icon={UserPlus}
    />
  );
}
