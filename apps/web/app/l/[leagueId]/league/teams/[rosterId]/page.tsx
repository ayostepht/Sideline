import { Shield } from "lucide-react";
import { StubPage } from "../../../../../../components/shell/stub-page";

export default function Page() {
  return (
    <StubPage
      title="Team"
      emptyTitle="Team pages are on their way"
      message="This team's roster will show up here."
      icon={Shield}
    />
  );
}
