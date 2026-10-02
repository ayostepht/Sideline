import { ErrorState } from "./empty-state";

export function DbError({ retryHref }: { retryHref: string }) {
  return (
    <main className="mx-auto max-w-xl p-3">
      <h1 className="sr-only">Sideline</h1>
      <ErrorState
        title="Sideline can't reach its database"
        detail="Check that the data folder is mounted and the app has run its migrations."
        retryHref={retryHref}
      />
    </main>
  );
}
