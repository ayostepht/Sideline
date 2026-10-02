import { DbError } from "../../components/db-error";
import { isMissingTableError } from "../../lib/client/onboarding";
import { getDb } from "../../lib/server/db";
import { getSettings } from "../../lib/server/identity";
import { getLeagueOverview } from "../../lib/server/league-views";
import { OnboardingFlow, type OnboardingInitial } from "./_components/onboarding-flow";

export const dynamic = "force-dynamic";

export default function OnboardingPage() {
  let initial: OnboardingInitial = {
    username: null,
    activeLeagueId: null,
    activeLeagueName: null,
    synced: false,
  };
  const db = getDb();
  if (!db.ok) return <DbError retryHref="/onboarding" />;
  try {
    const s = getSettings(db.handle);
    const overview =
      s.activeLeagueId === null ? null : getLeagueOverview(db.handle, s.activeLeagueId, new Date());
    initial = {
      username: s.sleeperUsername,
      activeLeagueId: s.activeLeagueId,
      activeLeagueName: overview?.ok ? overview.data.name : null,
      synced: overview?.ok === true,
    };
  } catch (err) {
    // A database the worker has not migrated yet is a normal first run: start from step 1.
    if (!isMissingTableError(err)) return <DbError retryHref="/onboarding" />;
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-8">
      <p className="text-lg font-semibold tracking-tight" data-testid="onboarding-wordmark">
        Sideline
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">Set up Sideline</h1>
      <OnboardingFlow initial={initial} />
    </main>
  );
}
