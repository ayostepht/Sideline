export default function Loading() {
  return (
    <div className="flex flex-col gap-3" data-testid="trades-page-loading">
      <div className="sl-skeleton h-8 w-32" aria-hidden />
      <div className="sl-skeleton h-11 w-48" aria-hidden />
      <div className="sl-skeleton h-44 w-full" aria-hidden />
      <div className="sl-skeleton h-44 w-full" aria-hidden />
      <div className="sl-skeleton h-44 w-full" aria-hidden />
    </div>
  );
}
