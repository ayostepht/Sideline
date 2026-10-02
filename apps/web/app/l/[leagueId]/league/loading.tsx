import { TableSkeleton } from "../../../../components/skeletons";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4" data-testid="league-page-loading">
      <div className="sl-skeleton h-8 w-40" aria-hidden />
      <TableSkeleton rows={8} cols={4} />
    </div>
  );
}
