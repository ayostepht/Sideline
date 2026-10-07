"use client";

import { ErrorStateLite } from "../components/error-state-lite";

export default function RootError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="mx-auto max-w-xl p-3">
      <h1 className="sr-only">Sideline</h1>
      <ErrorStateLite
        title="Something went wrong"
        detail="Sideline hit a problem loading this page. Try again."
        onRetry={retry}
      />
    </main>
  );
}
