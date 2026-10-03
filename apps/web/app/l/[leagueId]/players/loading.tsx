import { PlayerRowSkeleton, TableSkeleton } from "../../../../components/skeletons";

export default function Loading() {
  return (
    <div className="flex flex-col gap-3" data-testid="players-loading">
      <div className="sl-skeleton h-8 w-32" aria-hidden />
      <div className="sl-skeleton h-11 w-full sm:max-w-xs" aria-hidden />
      <PlayerRowSkeleton count={6} className="rounded-card border bg-card lg:hidden" />
      <TableSkeleton className="hidden rounded-card border bg-card p-3 lg:flex" />
    </div>
  );
}
