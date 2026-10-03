import { PlayerDetailResponseSchema } from "@sideline/shared";
import { afterEach, describe, expect, it } from "vitest";
import { seedLeague } from "../../../../../../lib/server/test-seed";
import { useTempDb, type TempDb } from "../../../../../../lib/server/test-utils";
import { GET } from "./route";

let tmp: TempDb | null = null;
afterEach(() => {
  tmp?.cleanup();
  tmp = null;
});

const request = (playerId: string, leagueId = "L1") =>
  GET(new Request(`http://localhost/api/l/${leagueId}/players/${playerId}`), {
    params: Promise.resolve({ leagueId, playerId }),
  });

describe("GET /api/l/[leagueId]/players/[playerId]", () => {
  it("returns a valid player detail response", async () => {
    tmp = useTempDb({ migrated: true });
    const h = tmp.handle;
    if (h === null) throw new Error("handle");
    seedLeague(h, { playerCount: 10, rosterCount: 1, rosterSize: 10 });
    const r = await request("p1");
    expect(r.status).toBe(200);
    expect(PlayerDetailResponseSchema.safeParse(await r.json()).success).toBe(true);
  });

  it("404 for an unknown player id or league", async () => {
    tmp = useTempDb({ migrated: true });
    const h = tmp.handle;
    if (h === null) throw new Error("handle");
    seedLeague(h);
    expect((await request("does-not-exist")).status).toBe(404);
    expect((await request("p1", "nope")).status).toBe(404);
  });
});
