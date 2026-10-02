import { redirect } from "next/navigation";
import { ErrorState } from "../components/empty-state";
import { getDb } from "../lib/server/db";
import { getIdentity } from "../lib/server/identity";

export const dynamic = "force-dynamic";

function DbError() {
  return (
    <main className="mx-auto max-w-xl p-4">
      <h1 className="sr-only">Sideline</h1>
      <ErrorState
        title="Sideline can't reach its database"
        detail="Check that the data folder is mounted and the app has run its migrations."
        retryHref="/"
      />
    </main>
  );
}

export default function RootPage() {
  const db = getDb();
  if (!db.ok) return <DbError />;
  let activeLeagueId: string | null;
  try {
    activeLeagueId = getIdentity(db.handle).activeLeagueId;
  } catch {
    return <DbError />;
  }
  if (activeLeagueId === null || activeLeagueId === "") redirect("/onboarding");
  redirect(`/l/${encodeURIComponent(activeLeagueId)}`);
}
