import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "../empty-state";

/** Placeholder page body: a heading plus an empty state. Replaced as features land. */
export function StubPage({
  title,
  emptyTitle,
  message,
  icon,
  leagueId,
}: {
  title: string;
  emptyTitle: string;
  message: string;
  icon: LucideIcon;
  leagueId: string;
}) {
  return (
    <div data-testid="stub-page">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <EmptyState icon={icon} title={emptyTitle} message={message} className="py-16" />
      <div className="flex flex-wrap justify-center gap-3" data-testid="stub-next-actions">
        {[
          { href: `/l/${encodeURIComponent(leagueId)}`, label: "Go to Home", id: "home" },
          { href: `/l/${encodeURIComponent(leagueId)}/team`, label: "See My Team", id: "team" },
        ].map((l) => (
          <Link
            key={l.id}
            href={l.href}
            data-testid={`stub-link-${l.id}`}
            className="inline-flex min-h-11 items-center rounded-[8px] border bg-card px-4 text-sm font-medium hover:bg-muted"
          >
            {l.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
