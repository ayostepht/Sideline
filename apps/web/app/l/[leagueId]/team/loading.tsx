import { PlayerRowSkeleton } from "../../../../components/skeletons";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4" data-testid="team-loading">
      <div className="sl-skeleton h-8 w-40" aria-hidden />
      <PlayerRowSkeleton count={9} />
    </div>
  );
}
