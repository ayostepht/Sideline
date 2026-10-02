import { Trophy } from "lucide-react";
import { StubPage } from "../../../../components/shell/stub-page";

export default function Page() {
  return (
    <StubPage
      title="League"
      emptyTitle="League is on its way"
      message="Standings and every team will show up here."
      icon={Trophy}
    />
  );
}
