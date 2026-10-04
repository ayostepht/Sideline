import { Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { getActiveLeagueId } from "@sideline/db";
import { PATCH as patchSettings } from "../../app/api/settings/route";
import { POST as startOnboarding } from "../../app/api/onboarding/route";
import { POST as selectLeague } from "../../app/api/onboarding/league/route";
import { POST as syncRun } from "../../app/api/sync/run/route";
import { clientIp, guardMutation, guardedWrite, isHttpsRequest } from "./http";
import { getLogger } from "./logger";
import { useTempDb, type TempDb } from "./test-utils";

let tmp: TempDb | null = null;
afterEach(() => {
  tmp?.cleanup();
  tmp = null;
});

const URL_ = "http://app.local:3000/api/onboarding/league";
const req = (headers: Record<string, string>, method = "POST", body = '{"leagueId":"L1"}') =>
  new Request(URL_, { method, headers, body });
const JSON_CT = { "content-type": "application/json" };

describe("guardMutation", () => {
  it("blocks cross-origin with 403", () => {
    const r = guardMutation(
      req({ ...JSON_CT, origin: "http://evil.example", host: "app.local:3000" }),
    );
    expect(r?.status).toBe(403);
    expect(r?.body).toEqual({
      error: { code: "cross_origin", message: "Cross-origin requests are not allowed." },
    });
  });
  it("blocks text/plain and missing content type with 415", () => {
    expect(guardMutation(req({ "content-type": "text/plain" }))?.status).toBe(415);
    expect(guardMutation(req({}))?.body).toMatchObject({
      error: { code: "unsupported_media_type" },
    });
  });
  it("allows json with charset, any case", () => {
    expect(guardMutation(req({ "content-type": "Application/JSON; charset=utf-8" }))).toBeNull();
  });
  it("allows a missing Origin", () => {
    expect(guardMutation(req(JSON_CT))).toBeNull();
  });
  it("allows Origin matching Host", () => {
    expect(
      guardMutation(req({ ...JSON_CT, origin: "http://app.local:3000", host: "app.local:3000" })),
    ).toBeNull();
  });
  it("allows Origin matching X-Forwarded-Host", () => {
    expect(
      guardMutation(
        req({
          ...JSON_CT,
          origin: "https://sideline.example.com",
          host: "10.0.0.5:3000",
          "x-forwarded-host": "sideline.example.com",
        }),
      ),
    ).toBeNull();
  });
  it("blocks a different port and an unparseable Origin", () => {
    expect(
      guardMutation(req({ ...JSON_CT, origin: "http://app.local:4000", host: "app.local:3000" }))
        ?.status,
    ).toBe(403);
    expect(guardMutation(req({ ...JSON_CT, origin: "null", host: "app.local:3000" }))?.status).toBe(
      403,
    );
  });
});

describe("mutating routes are guarded and do not write", () => {
  const evil = { ...JSON_CT, origin: "http://evil.example", host: "app.local:3000" };
  const text = { "content-type": "text/plain" };
  const routes: [string, (r: Request) => Promise<Response>, string][] = [
    ["POST onboarding", startOnboarding, "POST"],
    ["POST onboarding/league", selectLeague, "POST"],
    ["POST sync/run", syncRun, "POST"],
    ["PATCH settings", patchSettings, "PATCH"],
  ];
  for (const [name, route, method] of routes) {
    it(`${name}: cross-origin 403, text/plain 415`, async () => {
      tmp = useTempDb({ migrated: true });
      const body = JSON.stringify({ leagueId: "L1", username: "u", job: "all" });
      const a = await route(
        new Request("http://app.local:3000/api/x", { method, headers: evil, body }),
      );
      expect(a.status).toBe(403);
      const b = await route(
        new Request("http://app.local:3000/api/x", { method, headers: text, body }),
      );
      expect(b.status).toBe(415);
      const h = tmp.handle;
      if (h === null) throw new Error("handle");
      expect(getActiveLeagueId(h)).toBeNull();
      expect(h.sqlite.prepare("select count(*) as n from sync_requests").get()).toEqual({ n: 0 });
    });
  }
});

describe("clientIp", () => {
  it("uses the LAST X-Forwarded-For entry, the one the trusted proxy appended", () => {
    const r = new Request(URL_, { headers: { "x-forwarded-for": "9.9.9.9, 1.1.1.1" } });
    expect(clientIp(r)).toBe("1.1.1.1");
  });
  it("is not fooled by a spoofed first entry: same real last entry means same client", () => {
    const a = clientIp(new Request(URL_, { headers: { "x-forwarded-for": "1.1.1.1, 5.5.5.5" } }));
    const b = clientIp(new Request(URL_, { headers: { "x-forwarded-for": "2.2.2.2, 5.5.5.5" } }));
    expect(a).toBe(b);
    expect(a).toBe("5.5.5.5");
  });
  it("handles a single-entry header", () => {
    expect(clientIp(new Request(URL_, { headers: { "x-forwarded-for": "3.3.3.3" } }))).toBe(
      "3.3.3.3",
    );
  });
  it("falls back to X-Real-Ip, then a constant bucket, including for an empty or malformed header", () => {
    expect(clientIp(new Request(URL_, { headers: { "x-real-ip": "8.8.8.8" } }))).toBe("8.8.8.8");
    expect(clientIp(new Request(URL_))).toBe("direct");
    expect(
      clientIp(new Request(URL_, { headers: { "x-forwarded-for": "", "x-real-ip": "8.8.8.8" } })),
    ).toBe("8.8.8.8");
    expect(clientIp(new Request(URL_, { headers: { "x-forwarded-for": " , , " } }))).toBe("direct");
  });
});

describe("isHttpsRequest", () => {
  it("trusts X-Forwarded-Proto over the request's own protocol", () => {
    expect(isHttpsRequest(new Request(URL_, { headers: { "x-forwarded-proto": "https" } }))).toBe(
      true,
    );
    expect(isHttpsRequest(new Request(URL_, { headers: { "x-forwarded-proto": "http" } }))).toBe(
      false,
    );
  });
  it("falls back to the request URL's protocol when the header is absent", () => {
    expect(isHttpsRequest(new Request("https://app.local/x"))).toBe(true);
    expect(isHttpsRequest(new Request("http://app.local/x"))).toBe(false);
  });
});

describe("guardedWrite", () => {
  function captureLogger(): { log: ReturnType<typeof getLogger>; lines: () => unknown[] } {
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _enc: string, cb: () => void) {
        chunks.push(String(chunk));
        cb();
      },
    });
    return {
      log: getLogger({}, stream),
      lines: (): unknown[] =>
        chunks
          .flatMap((c) => c.trim().split("\n"))
          .filter(Boolean)
          .map((l): unknown => JSON.parse(l) as unknown),
    };
  }

  it("logs a structured success line with method, path, status, and duration", async () => {
    const { log, lines } = captureLogger();
    const ok = (): { status: number; body: unknown } => ({ status: 200, body: { ok: true } });
    await guardedWrite(
      new Request(URL_, { method: "POST", headers: JSON_CT, body: '{"secret":"shh"}' }),
      ok,
      log,
    );
    const [line] = lines() as {
      method: string;
      path: string;
      status: number;
      durationMs: number;
    }[];
    expect(line).toMatchObject({ method: "POST", path: "/api/onboarding/league", status: 200 });
    expect(typeof line?.durationMs).toBe("number");
    expect(JSON.stringify(line)).not.toContain("shh");
  });

  it("logs a structured error line and rethrows when the handler throws, without the raw body", async () => {
    const { log, lines } = captureLogger();
    const boom = (): never => {
      throw new Error("boom");
    };
    await expect(
      guardedWrite(
        new Request(URL_, { method: "POST", headers: JSON_CT, body: '{"password":"shh"}' }),
        boom,
        log,
      ),
    ).rejects.toThrow("boom");
    const [line] = lines() as { method: string; path: string; err: string }[];
    expect(line?.method).toBe("POST");
    expect(line?.err).toBe("boom");
    expect(JSON.stringify(line)).not.toContain("shh");
  });
});
