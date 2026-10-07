import { afterEach, describe, expect, it } from "vitest";
import { seedLeague } from "../../../../../../../../lib/server/test-seed";
import { useTempDb, type TempDb } from "../../../../../../../../lib/server/test-utils";
import { POST } from "./route";

let tmp: TempDb | null = null;
afterEach(() => {
  tmp?.cleanup();
  tmp = null;
});

const post = (playerId: string, init: RequestInit = {}) =>
  POST(
    new Request(`http://localhost/api/l/L1/players/${playerId}/news/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      ...init,
    }),
    { params: Promise.resolve({ leagueId: "L1", playerId }) },
  );

describe("POST /api/l/[leagueId]/players/[playerId]/news/refresh", () => {
  it("202 queued true then false; 404; 400; blocks cross-origin and non-JSON", async () => {
    tmp = useTempDb({ migrated: true });
    const h = tmp.handle;
    if (h === null) throw new Error("handle");
    seedLeague(h);
    const first = await post("p1");
    expect(first.status).toBe(202);
    expect(await first.json()).toEqual({ queued: true });
    expect(await (await post("p1")).json()).toEqual({ queued: false });
    expect((await post("zzz")).status).toBe(404);
    expect((await post("bad id")).status).toBe(400);
    expect(
      (
        await post("p2", {
          headers: { "content-type": "application/json", origin: "http://evil.test" },
        })
      ).status,
    ).toBe(403);
    expect((await post("p2", { headers: { "content-type": "text/plain" } })).status).toBe(415);
  });
});
