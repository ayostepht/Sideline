"use client";

import { ErrorStateLite } from "../../../components/error-state-lite";

export default function LeagueError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <ErrorStateLite
      title="This page could not load"
      detail="Something went wrong on our side. Try again."
      onRetry={retry}
    />
  );
}
