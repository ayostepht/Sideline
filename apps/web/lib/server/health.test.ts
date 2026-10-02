import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { finishRun, startRun, writeHeartbeat } from "@sideline/db";
import { HealthResponseSchema } from "@sideline/shared";
import { afterEach, describe, expect, it } from "vitest";
import { GET } from "../../app/api/health/route";
import { resetDbForTests } from "./db";
import { getHealth } from "./health";
import { useTempDb, type TempDb } from "./test-utils";

const NOW = new Date("2026-10-02T12:00:00.000Z");
let tmp: TempDb | null = null;
afterEach(() => {
  tmp?.cleanup();
  tmp = null;
});

function health(now = NOW) {
  const r = getHealth(now);
  return { status: r.status, body: HealthResponseSchema.parse(r.body) };
}

describe("getHealth", () => {
  it("is degraded with worker never on a fresh migrated DB", () => {
    tmp = useTempDb({ migrated: true });
    const { status, body } = health();
    expect(status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.worker).toEqual({ status: "never", lastHeartbeatAt: null });
    expect(body.db).toEqual({ ok: true, migrated: true });
    expect(body.lastSync).toBeNull();
  });

  it("is ok with a fresh heartbeat and reports the last finished run", () => {
    tmp = useTempDb({ migrated: true });
    const h = tmp.handle;
    if (h === null) throw new Error("handle");
    writeHeartbeat(h, new Date(NOW.getTime() - 30_000));
    const id = startRun(h, "state", new Date(NOW.getTime() - 20_000));
    finishRun(
      h,
      id,
      { status: "success", callsMade: 1, rowsChanged: 1, error: null },
      new Date(NOW.getTime() - 10_000),
    );
    const { status, body } = health();
    expect(status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.worker.status).toBe("ok");
    expect(body.lastSync).toEqual({
      job: "state",
      status: "success",
      finishedAt: "2026-10-02T11:59:50.000Z",
    });
  });

  it("is degraded with a stale heartbeat", () => {
    tmp = useTempDb({ migrated: true });
    if (tmp.handle === null) throw new Error("handle");
    writeHeartbeat(tmp.handle, new Date(NOW.getTime() - 10 * 60_000));
    const { status, body } = health();
    expect(status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.worker.status).toBe("stale");
  });

  it("is degraded when the DB is not migrated", () => {
    tmp = useTempDb({ migrated: false });
    const { status, body } = health();
    expect(status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.db).toEqual({ ok: true, migrated: false });
  });

  it("is 503 error when the data dir cannot be used", () => {
    resetDbForTests();
    const file = join(mkdtempSync(join(tmpdir(), "sideline-web-")), "not-a-dir");
    writeFileSync(file, "x");
    process.env["DATA_DIR"] = file;
    try {
      const { status, body } = health();
      expect(status).toBe(503);
      expect(body.status).toBe("error");
      expect(body.db.ok).toBe(false);
      expect(body.db.error).toBeTruthy();
    } finally {
      resetDbForTests();
      delete process.env["DATA_DIR"];
    }
  });

  it("is 503 error on invalid config instead of throwing", () => {
    resetDbForTests();
    process.env["DATA_DIR"] = "";
    process.env["TZ"] = "Not/AZone";
    try {
      expect(() => getHealth(NOW)).not.toThrow();
    } finally {
      delete process.env["DATA_DIR"];
      delete process.env["TZ"];
      resetDbForTests();
    }
  });
});

describe("GET /api/health", () => {
  it("returns no-store JSON matching the schema", async () => {
    tmp = useTempDb({ migrated: true });
    const res = GET();
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.status).toBe(200);
    HealthResponseSchema.parse(await res.json());
  });
});
