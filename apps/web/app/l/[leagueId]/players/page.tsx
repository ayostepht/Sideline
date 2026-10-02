import { Users } from "lucide-react";
import { StubPage } from "../../../../components/shell/stub-page";

export default function Page() {
  return (
    <StubPage
      title="Players"
      emptyTitle="The player explorer arrives soon"
      message="Search and filter every player here. For now, use search in the top bar."
      icon={Users}
    />
  );
}
