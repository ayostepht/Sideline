import { PlayerRowSkeleton } from "../../../../components/skeletons";

export default function Loading() {
  return (
    <div className="flex flex-col gap-3" data-testid="waivers-page-loading">
      <div className="sl-skeleton h-8 w-32" aria-hidden />
      <div className="sl-skeleton h-10 w-full max-w-md" aria-hidden />
      <div className="sl-skeleton h-16 w-full" aria-hidden />
      <PlayerRowSkeleton count={8} />
    </div>
  );
}
