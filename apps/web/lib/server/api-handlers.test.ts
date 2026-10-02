import {
  claimNext,
  complete,
  saveUserLeagues,
  setActiveLeagueId,
  setSleeperUserId,
  writeHeartbeat,
  type DbHandle,
} from "@sideline/db";
import { OnboardingStatusSchema, PlayerSearchResultSchema } from "@sideline/shared";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { POST as startRoute } from "../../app/api/onboarding/route";
import { POST as leagueRoute } from "../../app/api/onboarding/league/route";
import { GET as statusRoute } from "../../app/api/onboarding/status/route";
import { GET as searchRoute } from "../../app/api/l/[leagueId]/search/route";
import { GET as getSettingsRoute, PATCH as patchSettingsRoute } from "../../app/api/settings/route";
import { resetDbForTests } from "./db";
import { seedLeague } from "./test-seed";
import { useTempDb, type TempDb } from "./test-utils";

let tmp: TempDb | null = null;
afterEach(() => {
  tmp?.cleanup();
  tmp = null;
});
function setup(opts: { live?: boolean; migrated?: boolean } = {}): DbHandle {
  tmp = useTempDb({ migrated: opts.migrated ?? true });
  const h = tmp.handle;
  if (h === null) throw new Error("handle");
  if (opts.live !== false && opts.migrated !== false) writeHeartbeat(h, new Date());
  return h;
}
const json = async (r: Response): Promise<unknown> => (await r.json()) as unknown;
const post = (route: (r: Request) => Promise<Response>, body: string, path = "/x") =>
  route(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }),
  );
const patch = (body: string) =>
  patchSettingsRoute(
    new Request("http://localhost/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body,
    }),
  );
const search = (qs: string, leagueId = "L1") =>
  searchRoute(new Request(`http://localhost/api/l/${leagueId}/search${qs}`), {
    params: Promise.resolve({ leagueId }),
  });
const CHOICES = [
  {
    leagueId: "L1",
    name: "League One",
    season: 2026,
    totalRosters: 4,
    status: "in_season",
    avatar: null,
  },
];

describe("POST /api/onboarding", () => {
  it("202 then 200 on a duplicate", async () => {
    setup();
    const a = await post(startRoute, JSON.stringify({ username: "Fake_User" }));
    expect(a.status).toBe(202);
    expect(OnboardingStatusSchema.parse(await a.json())).toEqual({ phase: "resolving_user" });
    expect((await post(startRoute, JSON.stringify({ username: "fake_user" }))).status).toBe(200);
  });
  it("returns worker_offline with 200 when no worker is live", async () => {
    setup({ live: false });
    const r = await post(startRoute, JSON.stringify({ username: "fake_user" }));
    expect(r.status).toBe(200);
    expect(await json(r)).toEqual({ phase: "worker_offline" });
  });
  it("400 on bad JSON and bad usernames without echoing input", async () => {
    setup();
    expect((await post(startRoute, "{nope")).status).toBe(400);
    const r = await post(startRoute, JSON.stringify({ username: "bad name<script>" }));
    expect(r.status).toBe(400);
    const text = await r.text();
    expect(text).toContain("invalid_request");
    expect(text).not.toContain("script");
    const extra = await post(startRoute, JSON.stringify({ username: "ok", secret_key: 1 }));
    expect(extra.status).toBe(400);
    expect(await extra.text()).not.toContain("secret_key");
  });
  it("503 when the DB is not migrated", async () => {
    setup({ migrated: false });
    const r = await post(startRoute, JSON.stringify({ username: "fake_user" }));
    expect(r.status).toBe(503);
    expect(await json(r)).toEqual({
      error: { code: "db_not_migrated", message: "Database is not migrated yet." },
    });
  });
});

describe("GET /api/onboarding/status and POST /api/onboarding/league", () => {
  it("serves status and selects a stored league", async () => {
    const h = setup();
    expect(await json(statusRoute())).toEqual({ phase: "idle" });
    setSleeperUserId(h, "u7");
    saveUserLeagues(h, "u7", 2026, CHOICES, new Date());
    const ok = await post(leagueRoute, JSON.stringify({ leagueId: "L1" }));
    expect(ok.status).toBe(200);
    expect(await json(ok)).toEqual({
      activeLeagueId: "L1",
      sync: "queued",
      syncSince: (
        h.sqlite.prepare("SELECT requested_at AS r FROM sync_requests WHERE job = 'all'").get() as {
          r: string;
        }
      ).r,
    });
  });
  it("400 for a league not in the choices and for invalid bodies", async () => {
    const h = setup();
    setSleeperUserId(h, "u7");
    saveUserLeagues(h, "u7", 2026, CHOICES, new Date());
    const bad = await post(leagueRoute, JSON.stringify({ leagueId: "L9" }));
    expect(bad.status).toBe(400);
    expect(await json(bad)).toEqual({
      error: { code: "invalid_league", message: "That league is not one of your leagues." },
    });
    expect((await post(leagueRoute, JSON.stringify({}))).status).toBe(400);
    expect((await post(leagueRoute, "[")).status).toBe(400);
  });
  it("reports a finished leagues job through status", async () => {
    const h = setup();
    await post(startRoute, JSON.stringify({ username: "fake_user" }));
    setSleeperUserId(h, "u7");
    const r = claimNext(h, new Date());
    if (r === null) throw new Error("pending");
    complete(h, r.id, "done", null, new Date());
    expect(((await json(statusRoute())) as { phase: string }).phase).toBe("loading_leagues");
  });
});

describe("GET /api/l/[leagueId]/search", () => {
  it("returns results", async () => {
    const h = setup();
    seedLeague(h);
    const r = await search("?q=number1&limit=3");
    expect(r.status).toBe(200);
    const body = z.array(PlayerSearchResultSchema).parse(await r.json());
    expect(body).toHaveLength(3);
    expect(body[0]?.name).toBe("Player Number1");
  });
  it("404 for an unknown league, 400 for bad queries", async () => {
    const h = setup();
    seedLeague(h);
    expect((await search("?q=ab", "nope")).status).toBe(404);
    expect((await search("?q=a")).status).toBe(400);
    expect((await search("")).status).toBe(400);
    expect((await search("?q=ab&limit=99")).status).toBe(400);
    expect((await search("?q=ab", "x".repeat(70))).status).toBe(404);
  });
});

describe("/api/settings", () => {
  it("GET seeds from env-free DB and returns nulls", async () => {
    setup();
    const saved = { u: process.env["SLEEPER_USERNAME"], l: process.env["DEFAULT_LEAGUE_ID"] };
    delete process.env["SLEEPER_USERNAME"];
    delete process.env["DEFAULT_LEAGUE_ID"];
    try {
      const r = getSettingsRoute();
      expect(await json(r)).toEqual({
        sleeperUsername: null,
        sleeperUserId: null,
        activeLeagueId: null,
      });
    } finally {
      if (saved.u !== undefined) process.env["SLEEPER_USERNAME"] = saved.u;
      if (saved.l !== undefined) process.env["DEFAULT_LEAGUE_ID"] = saved.l;
    }
  });
  it("PATCH username restarts onboarding", async () => {
    setup();
    const r = await patch(JSON.stringify({ username: "New_User" }));
    expect(r.status).toBe(200);
    const body = (await r.json()) as { settings: { sleeperUsername: string }; onboarding: unknown };
    expect(body.settings.sleeperUsername).toBe("new_user");
    expect(body.onboarding).toEqual({ phase: "resolving_user" });
  });
  it("PATCH league validates against stored choices", async () => {
    const h = setup();
    setSleeperUserId(h, "u7");
    saveUserLeagues(h, "u7", 2026, CHOICES, new Date());
    const r = await patch(JSON.stringify({ leagueId: "L1" }));
    expect(r.status).toBe(200);
    expect(await json(r)).toMatchObject({
      settings: { activeLeagueId: "L1" },
      sync: "queued",
      syncSince: (
        h.sqlite.prepare("SELECT requested_at AS r FROM sync_requests WHERE job = 'all'").get() as {
          r: string;
        }
      ).r,
    });
    const again = await patch(JSON.stringify({ leagueId: "L1" }));
    expect(await json(again)).toMatchObject({ sync: "pending_reused" });
    expect((await patch(JSON.stringify({ leagueId: "L2" }))).status).toBe(400);
  });
  it("PATCH rejects empty, combined and malformed bodies", async () => {
    setup();
    expect((await patch("{}")).status).toBe(400);
    expect((await patch(JSON.stringify({ username: "a", leagueId: "L1" }))).status).toBe(400);
    expect((await patch("not json")).status).toBe(400);
    expect((await patch(JSON.stringify({ username: "bad name" }))).status).toBe(400);
  });
  it("PATCH username offline answers with worker_offline", async () => {
    setup({ live: false });
    const r = await patch(JSON.stringify({ username: "new_user" }));
    expect(((await r.json()) as { onboarding: unknown }).onboarding).toEqual({
      phase: "worker_offline",
    });
  });
  it("503 when the database cannot be opened", () => {
    tmp = useTempDb({ migrated: true });
    resetDbForTests();
    process.env["DATA_DIR"] = "/dev/null/not-a-dir";
    expect(getSettingsRoute().status).toBe(503);
  });
});

it("setActiveLeagueId is visible through settings", async () => {
  const h = setup();
  setActiveLeagueId(h, "L5");
  expect(await json(getSettingsRoute())).toMatchObject({ activeLeagueId: "L5" });
});
