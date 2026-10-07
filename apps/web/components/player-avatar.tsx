"use client";

import { useState } from "react";
import { cn } from "../lib/client/cn";
import { initials } from "../lib/client/initials";

/** Decorative headshot (the name sits next to it). Falls back to initials on a null URL or load error. */
export function PlayerAvatar({
  url,
  name,
  className,
}: {
  url: string | null | undefined;
  name: string;
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImg = typeof url === "string" && url !== "" && failedUrl !== url;
  return (
    <span
      className={cn(
        "inline-flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-card bg-muted text-lg font-bold text-muted-foreground sm:size-20 sm:text-xl",
        className,
      )}
      data-testid="player-avatar"
    >
      {showImg ? (
        // Remote CDN image (sleepercdn.com, allowed by CSP); plain img on purpose, next/image would proxy it through the server.
        <img
          src={url}
          alt=""
          width={80}
          height={80}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="size-full object-cover object-top"
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
    </span>
  );
}
