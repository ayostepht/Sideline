"use client";

import type { PlayerNews, PlayerNewsItem } from "@sideline/shared";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatRelativeTime, needsNewsRefresh, pickLatestNote } from "./player-card-format";

const REFRESH_DELAY_MS = 8000;

function ExternalLink({ url, label, context }: { url: string; label: string; context?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center text-xs text-link underline-offset-4 hover:underline"
    >
      {label}
      {context ? <span className="sr-only">: {context}</span> : null}
      <span className="sr-only"> (opens in new tab)</span>
    </a>
  );
}

function truncate(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * The newest player note: the update, then what it means for fantasy.
 * The Show more toggle appears only when the clamped text really overflows (measured).
 */
export function LatestNote({
  item,
  now,
  defaultExpanded = false,
  initialOverflowing = false,
}: {
  item: PlayerNewsItem;
  now: Date;
  defaultExpanded?: boolean;
  /** Seed for the measured overflow state; lets tests render the overflowing case without a DOM. */
  initialOverflowing?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [overflowing, setOverflowing] = useState(initialOverflowing);
  const analysisRef = useRef<HTMLParagraphElement>(null);
  const time = formatRelativeTime(item.publishedAt, now);
  const hasSummary = Boolean(item.summary);

  useEffect(() => {
    const el = analysisRef.current;
    if (!el || !hasSummary) return;
    // Only meaningful while clamped; when expanded keep the last measured answer.
    const measure = () => {
      if (el.classList.contains("line-clamp-4")) setOverflowing(el.scrollHeight > el.clientHeight);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasSummary, expanded, item.summary]);

  const showToggle = overflowing || expanded;
  return (
    <div className="flex flex-col gap-2 border-b pb-2" data-testid="player-news-latest">
      <div className="flex flex-col gap-1 border-l-2 border-foreground pl-3">
        <p className="sl-label">
          <span className="text-foreground">Latest</span>
          {time !== "" ? ` · ${time}` : ""}
        </p>
        <p className="break-words text-sm font-semibold leading-6 text-foreground">
          {item.headline}
        </p>
        {item.summary ? (
          <>
            <p
              ref={analysisRef}
              id={`news-analysis-${item.id}`}
              className={`break-words text-sm leading-6 text-foreground ${
                expanded ? "" : "line-clamp-4"
              }`}
              data-testid="player-news-latest-analysis"
            >
              {item.summary}
            </p>
            {showToggle ? (
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={`news-analysis-${item.id}`}
                onClick={() => setExpanded((v) => !v)}
                className="inline-flex min-h-11 w-fit items-center text-sm font-medium text-link underline-offset-4 hover:underline"
                data-testid="player-news-latest-toggle"
              >
                {expanded ? "Show less" : "Show more"}
              </button>
            ) : null}
          </>
        ) : null}
        {item.url ? (
          <ExternalLink
            url={item.url}
            label="Read full note on ESPN"
            context={truncate(item.headline)}
          />
        ) : null}
      </div>
    </div>
  );
}

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
  const all = news?.items ?? [];
  const latest = pickLatestNote(all);
  const items = (latest ? all.filter((n) => n.id !== latest.id) : all).slice(0, latest ? 4 : 5);
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
      {items.length === 0 && !latest ? (
        <p className="text-sm text-muted-foreground" data-testid="player-news-empty">
          No recent news.
        </p>
      ) : (
        <>
          {latest ? <LatestNote item={latest} now={now} /> : null}
          {items.length > 0 ? (
            <ul className="flex flex-col divide-y" data-testid="player-news-list">
              {items.map((n) => (
                <li key={n.id} className="py-2 first:pt-0 last:pb-0" data-testid="player-news-item">
                  {n.kind === "note" ? (
                    <p className="break-words text-sm font-medium leading-5">{n.headline}</p>
                  ) : (
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
                  )}
                  <p className="text-xs text-muted-foreground">
                    {n.source}
                    {formatRelativeTime(n.publishedAt, now) !== ""
                      ? ` · ${formatRelativeTime(n.publishedAt, now)}`
                      : ""}
                  </p>
                  {n.summary ? (
                    <p
                      className={`mt-1 break-words text-sm ${
                        n.kind === "note"
                          ? "line-clamp-2 text-foreground"
                          : "line-clamp-3 text-muted-foreground"
                      }`}
                    >
                      {n.summary}
                    </p>
                  ) : null}
                  {n.kind === "note" && n.url ? (
                    <ExternalLink
                      url={n.url}
                      label="Read full note on ESPN"
                      context={truncate(n.headline)}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
      <p className="text-xs text-muted-foreground">
        {latest ? "News from ESPN and RotoWire" : "News from ESPN"}
        {checking ? (
          <span role="status" data-testid="player-news-checking">
            {" · Checking for news..."}
          </span>
        ) : null}
      </p>
    </div>
  );
}
