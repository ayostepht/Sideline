import { SearchX } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "../components/empty-state";
import { Button } from "../components/ui/button";
import { getDb } from "../lib/server/db";
import { getIdentity } from "../lib/server/identity";
import { getLeagueOverview } from "../lib/server/league-views";

export const dynamic = "force-dynamic";

/** Only link to `/` when it lands on a stored league; otherwise onboarding, so no 404 loop. */
function safeHome(): { href: string; label: string } {
  try {
    const db = getDb();
    if (db.ok) {
      const id = getIdentity(db.handle).activeLeagueId;
      if (id && getLeagueOverview(db.handle, id, new Date()).ok) {
        return { href: "/", label: "Go home" };
      }
    }
  } catch {
    // fall through to onboarding
  }
  return { href: "/onboarding", label: "Set up your league" };
}

export default function NotFound() {
  const home = safeHome();
  return (
    <main className="mx-auto max-w-xl p-3">
      <EmptyState
        icon={SearchX}
        title="We could not find that page"
        message="The league or page may not exist."
        action={
          <Button asChild>
            <Link href={home.href}>{home.label}</Link>
          </Button>
        }
        className="py-16"
      />
    </main>
  );
}
