"use client";

import { ErrorState } from "../../../components/empty-state";

export default function LeagueError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <ErrorState
      title="This page could not load"
      detail="Something went wrong on our side. Try again."
      onRetry={retry}
    />
  );
}
