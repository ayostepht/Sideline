import { redirect } from "next/navigation";
import { DbError } from "../components/db-error";
import { getDb } from "../lib/server/db";
import { getIdentity } from "../lib/server/identity";
import { getLeagueOverview } from "../lib/server/league-views";

export const dynamic = "force-dynamic";

export default function RootPage() {
  let target = "/onboarding";
  try {
    const db = getDb();
    if (!db.ok) return <DbError retryHref="/" />;
    const id = getIdentity(db.handle).activeLeagueId;
    if (id !== null && id !== "" && getLeagueOverview(db.handle, id, new Date()).ok) {
      target = `/l/${encodeURIComponent(id)}`;
    }
  } catch {
    return <DbError retryHref="/" />;
  }
  redirect(target);
}
