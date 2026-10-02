"use client";

import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EmptyState } from "../empty-state";
import { Button } from "../ui/button";

/** Shown when the active league has no stored data yet (first sync still running). */
export function SyncingState() {
  const router = useRouter();
  return (
    <main className="mx-auto max-w-xl p-4" data-testid="league-syncing">
      <EmptyState
        icon={RefreshCw}
        title="Still syncing this league"
        message="Your league data is on its way. This can take a minute the first time."
        className="py-24"
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href="/onboarding">Check sync progress</Link>
            </Button>
            <Button type="button" variant="outline" onClick={() => router.refresh()}>
              Refresh
            </Button>
          </div>
        }
      />
    </main>
  );
}
