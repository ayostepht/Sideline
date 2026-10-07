import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cleanSummary,
  createMinIntervalLimiter,
  fetchEspnPlayerNews,
  fetchEspnRecentNews,
  type FetchFn,
} from "./index.js";

const FIX = resolve(import.meta.dirname, "../../../tests/fixtures/espn");
const load = (n: string): unknown => JSON.parse(readFileSync(resolve(FIX, n), "utf8"));
const json =
  (body: unknown, status = 200): FetchFn =>
  () =>
    Promise.resolve(new Response(JSON.stringify(body), { status }));
const fast = { limiter: createMinIntervalLimiter(0) };

describe("fetchEspnPlayerNews", () => {
  it("parses the per-player feed", async () => {
    const urls: string[] = [];
    const headers: unknown[] = [];
    const r = await fetchEspnPlayerNews("3139477", {
      ...fast,
      limit: 5,
      fetch: (u, init) => {
        urls.push(u);
        headers.push(init?.headers);
        return json(load("player-news.json"))(u, init);
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(urls[0]).toContain("playerId=3139477&limit=5");
    expect(JSON.stringify(headers[0])).toContain("Sideline");
    expect(r.data).toHaveLength(8);
    const first = r.data[0];
    expect(first?.espnAthleteIds).toEqual(["3139477"]);
    expect(first?.storyId).toMatch(/^\d+$/);
    expect(first?.publishedAt).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/);
    expect(first?.summary?.length ?? 0).toBeLessThanOrEqual(400);
    const sorted = [...r.data].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    expect(r.data).toEqual(sorted);
    expect(r.meta.source).toBe("espn-news");
  });

  it("rejects a non-numeric id without calling out", async () => {
    let called = false;
    const r = await fetchEspnPlayerNews("abc", {
      fetch: () => {
        called = true;
        return Promise.resolve(new Response("{}"));
      },
    });
    expect(r.ok).toBe(false);
    expect(called).toBe(false);
  });

  it("returns an empty list for an unknown player", async () => {
    const r = await fetchEspnPlayerNews("99999999", { ...fast, fetch: json({ feed: [] }) });
    expect(r).toMatchObject({ ok: true, data: [] });
  });

  it("returns not-ok on a malformed payload", async () => {
    const r = await fetchEspnPlayerNews("1", { ...fast, fetch: json({ feed: "nope" }) });
    expect(r).toMatchObject({ ok: false, reason: "parse" });
  });

  it("returns not-ok when every item is invalid, and skips single bad items", async () => {
    const bad = await fetchEspnPlayerNews("1", { ...fast, fetch: json({ feed: [{ id: 1 }] }) });
    expect(bad).toMatchObject({ ok: false, reason: "parse" });
    const good = { id: 2, headline: "H", published: "2026-10-05T00:00:00Z" };
    const mixed = await fetchEspnPlayerNews("1", {
      ...fast,
      fetch: json({ feed: [{ id: 1 }, good] }),
    });
    expect(mixed.ok && mixed.data.length).toBe(1);
    expect(mixed.ok && mixed.meta.warnings).toHaveLength(1);
  });

  it("returns not-ok on non-JSON, 500 and thrown fetch", async () => {
    const html: FetchFn = () => Promise.resolve(new Response("<html>"));
    expect(await fetchEspnPlayerNews("1", { ...fast, fetch: html })).toMatchObject({
      reason: "parse",
    });
    expect(await fetchEspnPlayerNews("1", { ...fast, fetch: json({}, 500) })).toMatchObject({
      ok: false,
      reason: "network",
    });
    expect(await fetchEspnPlayerNews("1", { ...fast, fetch: json({}, 404) })).toMatchObject({
      reason: "not_found",
    });
    const boom: FetchFn = () => Promise.reject(new Error("ECONNRESET"));
    expect(await fetchEspnPlayerNews("1", { ...fast, fetch: boom })).toMatchObject({ ok: false });
  });

  it("returns not-ok on timeout", async () => {
    const hang: FetchFn = (_u, init) =>
      new Promise((_res, rej) => {
        init?.signal?.addEventListener("abort", () => rej(new Error("aborted")));
      });
    const r = await fetchEspnPlayerNews("1", { ...fast, fetch: hang, timeoutMs: 20 });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toContain("timed out");
  });
});

describe("fetchEspnRecentNews", () => {
  it("parses the recent feed, including multi-athlete and athlete-less items", async () => {
    const r = await fetchEspnRecentNews({ ...fast, fetch: json(load("nfl-news.json")) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toHaveLength(10);
    expect(r.data.some((i) => i.espnAthleteIds.length > 1)).toBe(true);
    expect(r.data.some((i) => i.espnAthleteIds.length === 0)).toBe(true);
    expect(r.data.some((i) => i.url?.startsWith("https://www.espn.com/"))).toBe(true);
  });

  it("returns not-ok on a malformed payload and on 500", async () => {
    expect(await fetchEspnRecentNews({ ...fast, fetch: json({ nope: 1 }) })).toMatchObject({
      ok: false,
      reason: "parse",
    });
    expect(await fetchEspnRecentNews({ ...fast, fetch: json({}, 500) })).toMatchObject({
      ok: false,
    });
  });
});

describe("cleanSummary", () => {
  it("strips HTML and entities and collapses whitespace", () => {
    expect(cleanSummary("<p>Hi&nbsp;<b>there</b> &amp; you</p>\n<script>x()</script>  ok")).toBe(
      "Hi there & you ok",
    );
  });
  it("returns null for empty input and caps long text", () => {
    expect(cleanSummary(null)).toBeNull();
    expect(cleanSummary("<br>")).toBeNull();
    const s = cleanSummary("word ".repeat(200));
    expect(s?.length).toBeLessThanOrEqual(400);
    expect(s?.endsWith("…")).toBe(true);
  });
  it("decodes numeric, hex, and named typographic entities", () => {
    expect(cleanSummary("It&#39;s &#8217;ok&#x2019; &#x1F600; &hellip; &rsquo;&lsquo;")).toBe(
      "It's \u2019ok\u2019 \u{1F600} \u2026 \u2019\u2018",
    );
    expect(cleanSummary("&ldquo;a&rdquo; &mdash; b &ndash; c&nbsp;d")).toBe(
      "\u201Ca\u201D \u2014 b \u2013 c d",
    );
  });
  it("leaves invalid code points and unknown entities as-is", () => {
    expect(cleanSummary("x &#99999999999; &#xZZ; &bogus; y")).toBe(
      "x &#99999999999; &#xZZ; &bogus; y",
    );
  });
  it("exposes the HTTP status on failures", async () => {
    expect(await fetchEspnRecentNews({ ...fast, fetch: json({}, 429) })).toMatchObject({
      ok: false,
      status: 429,
    });
  });
  it("strips HTML from fetched items", async () => {
    const body = {
      articles: [
        {
          id: 1,
          headline: "H",
          description: "<p>Hello <i>world</i></p>",
          published: "2026-10-05T00:00:00Z",
        },
      ],
    };
    const r = await fetchEspnRecentNews({ ...fast, fetch: json(body) });
    expect(r.ok && r.data[0]?.summary).toBe("Hello world");
  });
});

describe("createMinIntervalLimiter", () => {
  it("spaces calls by the minimum interval", async () => {
    let t = 0;
    const slept: number[] = [];
    const lim = createMinIntervalLimiter(
      250,
      () => t,
      (ms) => {
        slept.push(ms);
        t += ms;
        return Promise.resolve();
      },
    );
    await lim.acquire();
    await lim.acquire();
    await lim.acquire();
    expect(slept).toEqual([250, 250]);
  });
});
