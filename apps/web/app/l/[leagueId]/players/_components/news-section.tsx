"use client";

import type { PlayerNews } from "@sideline/shared";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatRelativeTime, needsNewsRefresh } from "./player-card-format";

const REFRESH_DELAY_MS = 8000;

/** Recent news plus a one-shot background refresh request when the stored news is stale. */
export function NewsSection({
  playerId,
  news,
  nowIso,
}: {
  playerId: string;
  news: PlayerNews | undefined;
  /** Server render time, so relative times match between server and client render. */
  nowIso: string;
}) {
  const router = useRouter();
  const params = useParams<{ leagueId?: string }>();
  const leagueId = params.leagueId;
  const now = new Date(nowIso);
  const items = (news?.items ?? []).slice(0, 5);
  const lastFetchedAt = news?.lastFetchedAt ?? null;
  const [checking, setChecking] = useState(false);
  const started = useRef(false);

  // In React StrictMode (dev only) effects run twice: the first POST is aborted on cleanup, but the
  // server may already have queued it. The retry then gets `queued: false`, so no refresh is
  // scheduled in dev. Production runs the effect once.
  useEffect(() => {
    if (started.current || !leagueId) return;
    if (!needsNewsRefresh(lastFetchedAt, new Date())) return;
    started.current = true;
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      try {
        const res = await fetch(
          `/api/l/${encodeURIComponent(leagueId)}/players/${encodeURIComponent(playerId)}/news/refresh`,
          {
            method: "POST",
            cache: "no-store",
            signal: ctrl.signal,
            headers: { "Content-Type": "application/json" },
            body: "{}",
          },
        );
        if (!res.ok) return;
        const json: unknown = await res.json();
        const queued =
          typeof json === "object" &&
          json !== null &&
          (json as { queued?: unknown }).queued === true;
        if (!queued) return;
        setChecking(true);
        timer = setTimeout(() => {
          setChecking(false);
          router.refresh();
        }, REFRESH_DELAY_MS);
      } catch {
        // Fire and forget: news is optional.
      }
    })();
    return () => {
      ctrl.abort();
      if (timer) clearTimeout(timer);
      // Allow the StrictMode remount to retry; real unmounts do not rerun the effect.
      started.current = false;
    };
  }, [leagueId, playerId, lastFetchedAt, router]);

  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="player-news-empty">
          No recent news.
        </p>
      ) : (
        <ul className="flex flex-col divide-y" data-testid="player-news-list">
          {items.map((n) => (
            <li key={n.id} className="py-2 first:pt-0 last:pb-0" data-testid="player-news-item">
              <h3 className="text-sm font-semibold leading-5">
                {n.url ? (
                  <a
                    href={n.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-link underline-offset-4 hover:underline"
                  >
                    {n.headline}
                    <span className="sr-only"> (opens in new tab)</span>
                  </a>
                ) : (
                  n.headline
                )}
              </h3>
              <p className="text-xs text-muted-foreground">
                {n.source}
                {formatRelativeTime(n.publishedAt, now) !== ""
                  ? ` · ${formatRelativeTime(n.publishedAt, now)}`
                  : ""}
              </p>
              {n.summary ? (
                <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{n.summary}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        News from ESPN
        {checking ? (
          <span role="status" data-testid="player-news-checking">
            {" · Checking for news..."}
          </span>
        ) : null}
      </p>
    </div>
  );
}
