import { z } from "zod";
import type { FetchFn } from "./cache.js";
import type { ProviderResult } from "./types.js";

/** One news item. `espnAthleteIds` are ESPN athlete ids (Sleeper's `espn_id`), possibly empty. */
export interface EspnNewsItem {
  storyId: string;
  headline: string;
  summary: string | null;
  url: string | null;
  /** ISO 8601 UTC. */
  publishedAt: string;
  espnAthleteIds: string[];
}

/** Spaces out calls so several callers (jobs) can share one polite pace. */
export interface MinIntervalLimiter {
  acquire(): Promise<void>;
}

export function createMinIntervalLimiter(
  minIntervalMs = 250,
  now: () => number = Date.now,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): MinIntervalLimiter {
  let next = 0;
  return {
    async acquire() {
      const t = now();
      const start = Math.max(t, next);
      next = start + minIntervalMs;
      if (start > t) await sleep(start - t);
    },
  };
}

export interface EspnNewsOptions {
  fetch?: FetchFn;
  now?: () => Date;
  /** Per-request timeout. Default 10 s. */
  timeoutMs?: number;
  /** Max items requested. Per-player default 10, recent feed default 50 (ESPN honors both). */
  limit?: number;
  /** Share one limiter across calls. Default: a private 250 ms limiter per call. */
  limiter?: MinIntervalLimiter;
}

const SOURCE = "espn-news";
const USER_AGENT = "Sideline (self-hosted)";
const PLAYER_URL = "https://site.api.espn.com/apis/fantasy/v2/games/ffl/news/players";
const RECENT_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/news";
export const ESPN_SUMMARY_MAX = 400;

const idSchema = z.union([z.string(), z.number()]);
const linkSchema = z.looseObject({ href: z.string().optional() });
const linksSchema = z.looseObject({ web: linkSchema.optional(), mobile: linkSchema.optional() });

const playerItem = z.looseObject({
  id: idSchema,
  headline: z.string(),
  description: z.string().nullish(),
  story: z.string().nullish(),
  published: z.string(),
  playerId: idSchema.nullish(),
  links: linksSchema.nullish(),
});
const playerFeed = z.looseObject({ feed: z.array(z.unknown()) });

const recentItem = z.looseObject({
  id: idSchema,
  headline: z.string(),
  description: z.string().nullish(),
  published: z.string(),
  links: linksSchema.nullish(),
  categories: z
    .array(z.looseObject({ type: z.string().optional(), athleteId: idSchema.nullish() }))
    .nullish(),
});
const recentFeed = z.looseObject({ articles: z.array(z.unknown()) });

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

/** Removes tags and entities, collapses whitespace, caps length. Returns null when nothing remains. */
export function cleanSummary(
  raw: string | null | undefined,
  max = ESPN_SUMMARY_MAX,
): string | null {
  if (!raw) return null;
  const text = raw
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#?\w+);/g, (m, e: string) => ENTITIES[e] ?? m)
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function safeUrl(links: z.infer<typeof linksSchema> | null | undefined): string | null {
  for (const href of [links?.web?.href, links?.mobile?.href]) {
    if (href && /^https?:\/\//i.test(href)) return href;
  }
  return null;
}

function isoOrNull(s: string): string | null {
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

type Failure = Extract<ProviderResult<never>, { ok: false }>;

async function getJson(url: string, opts: EspnNewsOptions): Promise<{ json: unknown } | Failure> {
  const fetchFn: FetchFn = opts.fetch ?? ((u, init) => fetch(u, init));
  await (opts.limiter ?? createMinIntervalLimiter()).acquire();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 10_000);
  try {
    const res = await fetchFn(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      return {
        ok: false,
        reason: res.status === 404 ? "not_found" : "network",
        message: `ESPN news HTTP ${res.status}`,
      };
    }
    try {
      return { json: await res.json() };
    } catch {
      return { ok: false, reason: "parse", message: "ESPN news response is not JSON" };
    }
  } catch (e) {
    const aborted = ctrl.signal.aborted;
    return {
      ok: false,
      reason: "network",
      message: aborted
        ? `ESPN news request timed out after ${opts.timeoutMs ?? 10_000} ms`
        : `ESPN news request failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

function finish(
  raw: readonly unknown[],
  map: (item: unknown) => EspnNewsItem | null,
  opts: EspnNewsOptions,
): ProviderResult<EspnNewsItem[]> {
  const items: EspnNewsItem[] = [];
  let skipped = 0;
  for (const r of raw) {
    const m = map(r);
    if (m) items.push(m);
    else skipped++;
  }
  if (raw.length > 0 && items.length === 0) {
    return {
      ok: false,
      reason: "parse",
      message: `ESPN news: all ${raw.length} items failed validation`,
    };
  }
  items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return {
    ok: true,
    data: items,
    meta: {
      source: SOURCE,
      assetUpdatedAt: null,
      fetchedAt: (opts.now ?? (() => new Date()))().toISOString(),
      fromCache: false,
      warnings: skipped > 0 ? [`ESPN news: skipped ${skipped} invalid item(s)`] : [],
    },
  };
}

/** Recent news for one player, by ESPN athlete id (Sleeper `espn_id`). Never throws. */
export async function fetchEspnPlayerNews(
  espnId: string,
  opts: EspnNewsOptions = {},
): Promise<ProviderResult<EspnNewsItem[]>> {
  if (!/^\d+$/.test(espnId)) {
    return { ok: false, reason: "not_found", message: `invalid ESPN id "${espnId}"` };
  }
  const url = `${PLAYER_URL}?playerId=${espnId}&limit=${opts.limit ?? 10}`;
  const got = await getJson(url, opts);
  if (!("json" in got)) return got;
  const feed = playerFeed.safeParse(got.json);
  if (!feed.success) {
    return {
      ok: false,
      reason: "parse",
      message: `ESPN news shape: ${feed.error.issues[0]?.path.join(".") || "(root)"}`,
    };
  }
  return finish(
    feed.data.feed,
    (raw) => {
      const p = playerItem.safeParse(raw);
      if (!p.success) return null;
      const publishedAt = isoOrNull(p.data.published);
      if (!publishedAt) return null;
      const athlete = p.data.playerId == null ? espnId : String(p.data.playerId);
      return {
        storyId: String(p.data.id),
        headline: p.data.headline.trim(),
        summary: cleanSummary(p.data.story) ?? cleanSummary(p.data.description),
        url: safeUrl(p.data.links),
        publishedAt,
        espnAthleteIds: [athlete],
      };
    },
    opts,
  );
}

/** Recent league-wide NFL news; athlete ids come from the item's athlete categories. Never throws. */
export async function fetchEspnRecentNews(
  opts: EspnNewsOptions = {},
): Promise<ProviderResult<EspnNewsItem[]>> {
  const got = await getJson(`${RECENT_URL}?limit=${opts.limit ?? 50}`, opts);
  if (!("json" in got)) return got;
  const feed = recentFeed.safeParse(got.json);
  if (!feed.success) {
    return {
      ok: false,
      reason: "parse",
      message: `ESPN news shape: ${feed.error.issues[0]?.path.join(".") || "(root)"}`,
    };
  }
  return finish(
    feed.data.articles,
    (raw) => {
      const p = recentItem.safeParse(raw);
      if (!p.success) return null;
      const publishedAt = isoOrNull(p.data.published);
      if (!publishedAt) return null;
      const ids = (p.data.categories ?? [])
        .filter((c) => c.type === "athlete" && c.athleteId != null)
        .map((c) => String(c.athleteId));
      return {
        storyId: String(p.data.id),
        headline: p.data.headline.trim(),
        summary: cleanSummary(p.data.description),
        url: safeUrl(p.data.links),
        publishedAt,
        espnAthleteIds: [...new Set(ids)],
      };
    },
    opts,
  );
}
