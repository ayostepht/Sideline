import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Player } from "@sideline/shared";
import { dbPathFromDataDir, migrate, openDb, type DbHandle } from "./connection.js";
import {
  claimNext,
  countPendingTargetedRequests,
  enqueue,
  enqueuePlayerNewsRequest,
} from "./sync-bookkeeping.js";
import { prunePlayerNews, upsertPlayers, upsertPlayerNews, type PlayerNewsRow } from "./upserts.js";
import {
  readPlayerEspnIds,
  readPlayerNews,
  readPlayerNewsFetchedAt,
  recordPlayerNewsFetch,
} from "./sync-reads.js";

let dir: string;
let h: DbHandle;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "sideline-news-"));
  h = openDb(dbPathFromDataDir(dir));
  migrate(h);
});
afterEach(() => {
  h.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

const news = (
  id: string,
  playerId: string,
  publishedAt: string,
  headline = "H",
): PlayerNewsRow => ({
  id,
  playerId,
  headline,
  summary: null,
  url: "https://example.test/x",
  source: "ESPN",
  publishedAt,
  fetchedAt: "2026-10-06T00:00:00.000Z",
});
const player = (id: string, espnId?: string | null): Player => ({
  playerId: id,
  fullName: `Player ${id}`,
  firstName: null,
  lastName: null,
  position: "WR",
  fantasyPositions: ["WR"],
  team: "KC",
  status: null,
  injuryStatus: null,
  injuryBodyPart: null,
  active: true,
  age: null,
  yearsExp: null,
  depthChartOrder: null,
  searchRank: null,
  gsisId: null,
  ...(espnId === undefined ? {} : { espnId }),
});

describe("player_news upsert, prune, read", () => {
  it("updates kind on conflict and defaults to article", () => {
    upsertPlayerNews(h, [news("k1", "p1", "2026-10-05T00:00:00.000Z")]);
    expect(readPlayerNews(h, "p1")[0]?.kind).toBe("article");
    const r = upsertPlayerNews(h, [
      { ...news("k1", "p1", "2026-10-05T00:00:00.000Z"), kind: "note" },
    ]);
    expect(r.rowsChanged).toBe(1);
    expect(readPlayerNews(h, "p1")[0]?.kind).toBe("note");
  });

  it("is idempotent and counts a changed headline once", () => {
    const base = news("espn:1:p1", "p1", "2026-10-01T00:00:00.000Z");
    const rows = [base];
    expect(upsertPlayerNews(h, rows).rowsChanged).toBe(1);
    expect(
      upsertPlayerNews(h, [{ ...base, fetchedAt: "2026-10-07T00:00:00.000Z" }]).rowsChanged,
    ).toBe(0);
    expect(upsertPlayerNews(h, [{ ...base, headline: "New" }]).rowsChanged).toBe(1);
    expect(readPlayerNews(h, "p1")[0]?.headline).toBe("New");
    expect(upsertPlayerNews(h, []).rowsChanged).toBe(0);
  });

  it("reads newest first with a limit (default 5) and only the requested player", () => {
    const rows = Array.from({ length: 7 }, (_, i) =>
      news(`espn:${i}:p1`, "p1", `2026-10-0${i + 1}T00:00:00.000Z`),
    );
    upsertPlayerNews(h, [...rows, news("espn:9:p2", "p2", "2026-10-09T00:00:00.000Z")]);
    const def = readPlayerNews(h, "p1");
    expect(def).toHaveLength(5);
    expect(def[0]?.id).toBe("espn:6:p1");
    expect(def.map((r) => r.publishedAt)).toEqual(
      [...def.map((r) => r.publishedAt)].sort().reverse(),
    );
    expect(readPlayerNews(h, "p1", { limit: 2 })).toHaveLength(2);
    expect(readPlayerNews(h, "none")).toEqual([]);
  });

  it("prunes items published before the cutoff and returns the count", () => {
    upsertPlayerNews(h, [
      news("a", "p1", "2026-09-01T00:00:00.000Z"),
      news("b", "p1", "2026-09-15T00:00:00.000Z"),
      news("c", "p1", "2026-10-01T00:00:00.000Z"),
    ]);
    expect(prunePlayerNews(h, { olderThanIso: "2026-09-20T00:00:00.000Z" })).toBe(2);
    expect(readPlayerNews(h, "p1").map((r) => r.id)).toEqual(["c"]);
    expect(prunePlayerNews(h, { olderThanIso: "2026-09-20T00:00:00.000Z" })).toBe(0);
  });
});

describe("players.espn_id", () => {
  it("stores espnId, counts real changes only, and keeps it when later omitted or null", () => {
    expect(upsertPlayers(h, [player("p1"), player("p2", "111")], "t1").rowsChanged).toBe(2);
    expect(upsertPlayers(h, [player("p1"), player("p2", "111")], "t2").rowsChanged).toBe(0);
    expect(upsertPlayers(h, [player("p1", "222")], "t3").rowsChanged).toBe(1);
    expect(upsertPlayers(h, [player("p1"), player("p2", null)], "t4").rowsChanged).toBe(0);
    expect(readPlayerEspnIds(h)).toEqual(
      new Map([
        ["p1", "222"],
        ["p2", "111"],
      ]),
    );
    expect(upsertPlayers(h, [player("p2", "333")], "t5").rowsChanged).toBe(1);
  });

  it("readPlayerEspnIds filters to the given ids and skips players without one", () => {
    upsertPlayers(h, [player("p1", "1"), player("p2", "2"), player("p3")], "t");
    expect(readPlayerEspnIds(h, ["p1", "p3", "zz"])).toEqual(new Map([["p1", "1"]]));
    expect(readPlayerEspnIds(h, [])).toEqual(new Map());
    expect(readPlayerEspnIds(h).size).toBe(2);
  });
});

describe("enqueuePlayerNewsRequest", () => {
  const now = "2026-10-06T12:00:00.000Z";
  it("dedupes per player, allows other players, and surfaces target in claim", () => {
    const first = enqueuePlayerNewsRequest(h, "p1", now);
    expect(first.created).toBe(true);
    expect(first.request.job).toBe("player_news");
    expect(first.request.target).toBe("p1");
    const dup = enqueuePlayerNewsRequest(h, "p1", "2026-10-06T12:00:05.000Z");
    expect(dup.created).toBe(false);
    expect(dup.request.id).toBe(first.request.id);
    expect(enqueuePlayerNewsRequest(h, "p2", now).created).toBe(true);
    const claimed = claimNext(h, new Date(now));
    expect(claimed?.target).toBe("p1");
    expect(claimed?.status).toBe("running");
    expect(enqueuePlayerNewsRequest(h, "p1", "2026-10-06T12:01:00.000Z").created).toBe(false);
  });

  it("allows a new request once the running one is stale or finished", () => {
    enqueuePlayerNewsRequest(h, "p1", now);
    claimNext(h, new Date(now));
    expect(enqueuePlayerNewsRequest(h, "p1", "2026-10-06T13:00:00.000Z").created).toBe(true);
  });

  it("an untargeted player_news request does not dedupe against a targeted one", () => {
    enqueuePlayerNewsRequest(h, "p1", now);
    const r = enqueue(h, "player_news", "cli", new Date(now));
    expect(r.target ?? null).toBeNull();
    expect(r.id).not.toBe(enqueuePlayerNewsRequest(h, "p1", now).request.id);
  });
});

describe("news fetch attempts", () => {
  const rec = (ok: boolean, attemptedAt: string, itemCount = 0): void =>
    recordPlayerNewsFetch(h, { playerId: "p1", attemptedAt, ok, itemCount });

  it("returns null with no rows or attempts, and upserts one row per player", () => {
    expect(readPlayerNewsFetchedAt(h, "p1")).toBeNull();
    rec(true, "2026-10-06T10:00:00.000Z");
    rec(true, "2026-10-06T11:00:00.000Z", 2);
    expect(readPlayerNewsFetchedAt(h, "p1")).toBe("2026-10-06T11:00:00.000Z");
    expect(h.sqlite.prepare("SELECT COUNT(*) AS n FROM player_news_fetches").get()).toEqual({
      n: 1,
    });
  });

  it("ignores failed attempts", () => {
    rec(false, "2026-10-06T11:00:00.000Z");
    expect(readPlayerNewsFetchedAt(h, "p1")).toBeNull();
  });

  it("the later of attempt and news rows wins", () => {
    upsertPlayerNews(h, [news("a", "p1", "2026-10-05T00:00:00.000Z")]); // fetched 10-06T00:00
    rec(true, "2026-10-05T12:00:00.000Z");
    expect(readPlayerNewsFetchedAt(h, "p1")).toBe("2026-10-06T00:00:00.000Z");
    rec(true, "2026-10-06T09:00:00.000Z");
    expect(readPlayerNewsFetchedAt(h, "p1")).toBe("2026-10-06T09:00:00.000Z");
  });
});

describe("countPendingTargetedRequests", () => {
  const now = "2026-10-06T12:00:00.000Z";
  it("counts only pending targeted requests for the job", () => {
    expect(countPendingTargetedRequests(h, "player_news")).toBe(0);
    enqueuePlayerNewsRequest(h, "p1", now);
    enqueuePlayerNewsRequest(h, "p2", now);
    enqueue(h, "player_news", "cli", new Date(now));
    expect(countPendingTargetedRequests(h, "player_news")).toBe(2);
    claimNext(h, new Date(now));
    expect(countPendingTargetedRequests(h, "player_news")).toBe(1);
  });
});
