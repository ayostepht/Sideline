import { Settings } from "lucide-react";
import { StubPage } from "../../../../components/shell/stub-page";

export default function Page() {
  return (
    <StubPage
      title="Settings"
      emptyTitle="Settings are on their way"
      message="League, username, theme and sync controls will show up here."
      icon={Settings}
    />
  );
}
