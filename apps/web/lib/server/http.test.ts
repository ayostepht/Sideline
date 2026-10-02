import { afterEach, describe, expect, it } from "vitest";
import { getActiveLeagueId } from "@sideline/db";
import { PATCH as patchSettings } from "../../app/api/settings/route";
import { POST as startOnboarding } from "../../app/api/onboarding/route";
import { POST as selectLeague } from "../../app/api/onboarding/league/route";
import { POST as syncRun } from "../../app/api/sync/run/route";
import { guardMutation } from "./http";
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
