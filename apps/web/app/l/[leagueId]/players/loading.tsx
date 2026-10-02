import { CardSkeleton } from "../../../../components/skeletons";

export default function Loading() {
  return (
    <div className="flex flex-col gap-3" data-testid="players-loading">
      <div className="sl-skeleton h-8 w-32" aria-hidden />
      <CardSkeleton />
    </div>
  );
}
