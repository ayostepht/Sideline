import { describe, expect, it } from "vitest";
import pkg from "../../../package.json";
import { GET } from "./route";

describe("GET /api/health", () => {
  it("returns 200 with status, version, and an ISO time", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["status", "time", "version"]);
    expect(body.status).toBe("ok");
    expect(body.version).toBe(pkg.version);
    const time = body.time;
    if (typeof time !== "string") throw new Error("time must be a string");
    expect(new Date(time).toISOString()).toBe(time);
  });

  it("is never cached", () => {
    expect(GET().headers.get("cache-control")).toBe("no-store");
  });
});
