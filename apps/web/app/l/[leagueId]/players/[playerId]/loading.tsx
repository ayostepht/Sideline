import { StatCardSkeleton } from "../../../../../components/skeletons";

export default function Loading() {
  return (
    <div className="flex flex-col gap-3" data-testid="player-detail-loading">
      <div className="sl-skeleton h-8 w-48" aria-hidden />
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
      <div className="sl-skeleton h-40 w-full rounded-card" aria-hidden />
    </div>
  );
}
