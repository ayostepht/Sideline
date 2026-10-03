import { PlayersListResponseSchema } from "@sideline/shared";
import { afterEach, describe, expect, it } from "vitest";
import { seedLeague } from "../../../../../lib/server/test-seed";
import { useTempDb, type TempDb } from "../../../../../lib/server/test-utils";
import { GET } from "./route";

let tmp: TempDb | null = null;
afterEach(() => {
  tmp?.cleanup();
  tmp = null;
});

const request = (qs: string, leagueId = "L1") =>
  GET(new Request(`http://localhost/api/l/${leagueId}/players${qs}`), {
    params: Promise.resolve({ leagueId }),
  });

describe("GET /api/l/[leagueId]/players", () => {
  it("returns a valid paginated response", async () => {
    tmp = useTempDb({ migrated: true });
    const h = tmp.handle;
    if (h === null) throw new Error("handle");
    seedLeague(h, { playerCount: 10, rosterCount: 1, rosterSize: 10 });
    const r = await request("?page=1&pageSize=5");
    expect(r.status).toBe(200);
    expect(PlayersListResponseSchema.safeParse(await r.json()).success).toBe(true);
  });

  it("404 for an unknown league", async () => {
    tmp = useTempDb({ migrated: true });
    const h = tmp.handle;
    if (h === null) throw new Error("handle");
    seedLeague(h);
    const r = await request("", "nope");
    expect(r.status).toBe(404);
  });

  it("400 for an invalid page size", async () => {
    tmp = useTempDb({ migrated: true });
    const h = tmp.handle;
    if (h === null) throw new Error("handle");
    seedLeague(h);
    const r = await request("?pageSize=0");
    expect(r.status).toBe(400);
  });
});
