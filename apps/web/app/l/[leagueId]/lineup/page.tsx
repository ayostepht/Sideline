import { ClipboardList } from "lucide-react";
import { StubPage } from "../../../../components/shell/stub-page";

export default function Page() {
  return (
    <StubPage
      title="Lineup"
      emptyTitle="Lineup arrives with the optimizer"
      message="Your best lineup and the swaps to make will show up here."
      icon={ClipboardList}
    />
  );
}
