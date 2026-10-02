import { Swords } from "lucide-react";
import { StubPage } from "../../../../components/shell/stub-page";

export default function Page() {
  return (
    <StubPage
      title="Matchup"
      emptyTitle="Win probability arrives later"
      message="Your weekly matchup and its odds will show up here."
      icon={Swords}
    />
  );
}
