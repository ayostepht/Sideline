import { CardSkeleton, PlayerRowSkeleton } from "../../../../components/skeletons";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4" data-testid="league-loading">
      <div className="sl-skeleton h-8 w-40" aria-hidden />
      <CardSkeleton />
      <CardSkeleton />
      <PlayerRowSkeleton count={4} />
    </div>
  );
}
