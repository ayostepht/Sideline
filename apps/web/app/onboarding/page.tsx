import { UserRound } from "lucide-react";
import { EmptyState } from "../../components/empty-state";

export default function OnboardingPage() {
  return (
    <main className="mx-auto max-w-xl p-4">
      <h1 className="sr-only">Welcome to Sideline</h1>
      <EmptyState
        icon={UserRound}
        title="Setup is on its way"
        message="You will connect your Sleeper username and pick a league here."
        className="py-24"
      />
    </main>
  );
}
