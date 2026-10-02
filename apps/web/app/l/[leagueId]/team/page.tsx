import { Shield } from "lucide-react";
import { StubPage } from "../../../../components/shell/stub-page";

export default function Page() {
  return (
    <StubPage
      title="My Team"
      emptyTitle="My Team is on its way"
      message="Your roster will show up here."
      icon={Shield}
    />
  );
}
