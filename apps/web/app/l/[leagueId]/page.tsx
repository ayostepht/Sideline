import { House } from "lucide-react";
import { StubPage } from "../../../components/shell/stub-page";

export default function Page() {
  return (
    <StubPage
      title="Home"
      emptyTitle="Home is on its way"
      message="Your week at a glance will show up here."
      icon={House}
    />
  );
}
