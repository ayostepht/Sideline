import { describe, expect, it } from "vitest";
import {
  HealthResponseSchema,
  WORKER_STALE_AFTER_MS,
  deriveHealthStatus,
  deriveWorkerStatus,
  healthHttpStatus,
} from "./index.js";

const okDb = { ok: true, migrated: true };

describe("deriveHealthStatus", () => {
  it("HOST-3: error when db is not ok", () => {
    expect(
      deriveHealthStatus({ db: { ok: false, migrated: false }, worker: { status: "ok" } }),
    ).toBe("error");
  });
  it("HOST-3: degraded when db is not migrated", () => {
    expect(
      deriveHealthStatus({ db: { ok: true, migrated: false }, worker: { status: "ok" } }),
    ).toBe("degraded");
  });
  it("HOST-3: degraded when worker never reported", () => {
    expect(deriveHealthStatus({ db: okDb, worker: { status: "never" } })).toBe("degraded");
  });
  it("HOST-3: degraded when worker heartbeat is stale", () => {
    expect(deriveHealthStatus({ db: okDb, worker: { status: "stale" } })).toBe("degraded");
  });
  it("HOST-3: ok when all good", () => {
    expect(deriveHealthStatus({ db: okDb, worker: { status: "ok" } })).toBe("ok");
  });
  it("maps to http status", () => {
    expect(healthHttpStatus("ok")).toBe(200);
    expect(healthHttpStatus("degraded")).toBe(200);
    expect(healthHttpStatus("error")).toBe(503);
  });
});

describe("deriveWorkerStatus", () => {
  it("never, ok, stale (boundary is not stale)", () => {
    expect(deriveWorkerStatus(null, 1000)).toBe("never");
    expect(deriveWorkerStatus(1000, 1000 + WORKER_STALE_AFTER_MS)).toBe("ok");
    expect(deriveWorkerStatus(1000, 1001 + WORKER_STALE_AFTER_MS)).toBe("stale");
    expect(deriveWorkerStatus(0, 5, 2)).toBe("stale");
  });
});

describe("HealthResponseSchema", () => {
  it("round-trips and rejects unknown keys", () => {
    const body = {
      status: "ok",
      version: "0.0.0",
      time: "2026-10-02T00:00:00.000Z",
      db: okDb,
      worker: { status: "ok", lastHeartbeatAt: "2026-10-02T00:00:00.000Z" },
      lastSync: { job: "state", status: "success", finishedAt: null },
    };
    expect(HealthResponseSchema.parse(JSON.parse(JSON.stringify(body)))).toEqual(body);
    expect(HealthResponseSchema.safeParse({ ...body, extra: 1 }).success).toBe(false);
  });
});
