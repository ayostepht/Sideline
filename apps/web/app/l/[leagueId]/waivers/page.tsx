import { UserPlus } from "lucide-react";
import { StubPage } from "../../../../components/shell/stub-page";

export default function Page() {
  return (
    <StubPage
      title="Waivers"
      emptyTitle="Waiver tools arrive soon"
      message="Pickup targets and drop suggestions will show up here."
      icon={UserPlus}
    />
  );
}
