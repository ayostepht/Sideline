import { complete } from "@sideline/db";
import {
  SYNC_CADENCE_MS,
  SYNC_JOB_NAMES,
  SyncRunResponseSchema,
  SyncStatusResponseSchema,
} from "@sideline/shared";
import { afterEach, describe, expect, it } from "vitest";
import { GET as statusGET } from "../../app/api/sync/status/route";
import { POST } from "../../app/api/sync/run/route";
import { finishRun, startRun } from "@sideline/db";
import { getSyncStatus, isStale, requestSync } from "./sync";
import { useTempDb, type TempDb } from "./test-utils";

const NOW = new Date("2026-10-02T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
let tmp: TempDb | null = null;
afterEach(() => {
  tmp?.cleanup();
  tmp = null;
});

function seed(): NonNullable<TempDb["handle"]> {
  tmp = useTempDb({ migrated: true });
  if (tmp.handle === null) throw new Error("handle");
  return tmp.handle;
}

describe("isStale", () => {
  it("applies 2x cadence, never-run and one-time jobs", () => {
    const hour = 3_600_000;
    expect(isStale("league", null, NOW.getTime())).toBe(true);
    expect(isStale("league", ago(1.9 * hour).toISOString(), NOW.getTime())).toBe(false);
    expect(isStale("league", ago(2.1 * hour).toISOString(), NOW.getTime())).toBe(true);
    expect(isStale("backfill_2025", ago(900 * hour).toISOString(), NOW.getTime())).toBe(false);
    expect(isStale("league", "garbage", NOW.getTime())).toBe(true);
    expect(Object.keys(SYNC_CADENCE_MS).sort()).toEqual([...SYNC_JOB_NAMES].sort());
    expect(isStale("projections", ago(2.1 * hour).toISOString(), NOW.getTime())).toBe(true);
    expect(isStale("projections", ago(1.9 * hour).toISOString(), NOW.getTime())).toBe(false);
  });
});

describe("getSyncStatus", () => {
  it("covers every job with stale flags and lists pending", () => {
    const h = seed();
    const fresh = startRun(h, "state", ago(60_000));
    finishRun(
      h,
      fresh,
      { status: "success", callsMade: 1, rowsChanged: 0, error: null },
      ago(50_000),
    );
    const old = startRun(h, "league", ago(5 * 3_600_000));
    finishRun(
      h,
      old,
      { status: "success", callsMade: 1, rowsChanged: 0, error: null },
      ago(5 * 3_600_000),
    );
    requestSync("{}", NOW);
    const r = getSyncStatus(NOW);
    expect(r.status).toBe(200);
    const body = SyncStatusResponseSchema.parse(r.body);
    expect(body.jobs.map((j) => j.job)).toEqual([...SYNC_JOB_NAMES]);
    const by = Object.fromEntries(body.jobs.map((j) => [j.job, j]));
    expect(by["state"]?.stale).toBe(false);
    expect(by["state"]?.lastRun?.status).toBe("success");
    expect(by["league"]?.stale).toBe(true);
    expect(by["rosters"]?.stale).toBe(true);
    expect(by["rosters"]?.lastRun).toBeNull();
    expect(body.pending).toHaveLength(1);
  });

  it("returns 503 when unmigrated", async () => {
    tmp = useTempDb({ migrated: false });
    const res = statusGET();
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("db_not_migrated");
  });
});

describe("requestSync", () => {
  it("enqueues (202), then dedupes (200)", () => {
    seed();
    const first = requestSync("", NOW);
    expect(first.status).toBe(202);
    const a = SyncRunResponseSchema.parse(first.body);
    expect(a.deduplicated).toBe(false);
    expect(a.request).toMatchObject({ job: "all", status: "pending", source: "api" });
    const second = requestSync("{}", ago(-5_000));
    expect(second.status).toBe(200);
    const b = SyncRunResponseSchema.parse(second.body);
    expect(b.deduplicated).toBe(true);
    expect(b.request.id).toBe(a.request.id);
  });

  it("dedupes a running request even inside the debounce window", () => {
    const h = seed();
    const a = SyncRunResponseSchema.parse(requestSync("{}", NOW).body);
    h.sqlite
      .prepare("UPDATE sync_requests SET status = 'running', started_at = ? WHERE id = ?")
      .run(NOW.toISOString(), a.request.id);
    const r = requestSync("{}", ago(-1000));
    expect(r.status).toBe(200);
    expect(SyncRunResponseSchema.parse(r.body).deduplicated).toBe(true);
  });

  it("returns 429 with Retry-After within 60 s of a completed request, 202 after", () => {
    const h = seed();
    const a = SyncRunResponseSchema.parse(requestSync("{}", NOW).body);
    complete(h, a.request.id, "done", null, ago(-5_000));
    const limited = requestSync("{}", ago(-20_000));
    expect(limited.status).toBe(429);
    expect(limited.headers?.["Retry-After"]).toBe("40");
    expect(limited.body).toMatchObject({ error: { code: "rate_limited" } });
    expect(requestSync("{}", ago(-61_000)).status).toBe(202);
  });

  it("accepts a specific job and debounces per job", () => {
    const h = seed();
    const a = SyncRunResponseSchema.parse(requestSync('{"job":"rosters"}', NOW).body);
    expect(a.request.job).toBe("rosters");
    complete(h, a.request.id, "done", null, NOW);
    expect(requestSync('{"job":"matchups"}', ago(-1000)).status).toBe(202);
  });

  it("rejects bad bodies with 400", () => {
    seed();
    for (const raw of ['{"job":"nope"}', "not json", '{"job":"all","x":1}']) {
      const r = requestSync(raw, NOW);
      expect(r.status).toBe(400);
      expect(r.body).toMatchObject({ error: { code: "invalid_body" } });
    }
  });

  it("returns 503 when unmigrated", () => {
    tmp = useTempDb({ migrated: false });
    expect(requestSync("{}", NOW).status).toBe(503);
  });
});

describe("POST /api/sync/run", () => {
  it("accepts an empty body as 'all' and returns 202", async () => {
    seed();
    const res = await POST(new Request("http://x/api/sync/run", { method: "POST" }));
    expect(res.status).toBe(202);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(SyncRunResponseSchema.parse(await res.json()).request.job).toBe("all");
  });
});
