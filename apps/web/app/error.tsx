"use client";

import { ErrorState } from "../components/empty-state";

export default function RootError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="mx-auto max-w-xl p-3">
      <h1 className="sr-only">Sideline</h1>
      <ErrorState
        title="Something went wrong"
        detail="Sideline hit a problem loading this page. Try again."
        onRetry={retry}
      />
    </main>
  );
}
