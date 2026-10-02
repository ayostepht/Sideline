import type { LucideIcon } from "lucide-react";
import { EmptyState } from "../empty-state";

/** Placeholder page body: a heading plus an empty state. Replaced as features land. */
export function StubPage({
  title,
  emptyTitle,
  message,
  icon,
}: {
  title: string;
  emptyTitle: string;
  message: string;
  icon: LucideIcon;
}) {
  return (
    <div data-testid="stub-page">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <EmptyState icon={icon} title={emptyTitle} message={message} className="py-16" />
    </div>
  );
}
