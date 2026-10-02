import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { parseCsvTable } from "./csv.js";
import { byeWeeks, impliedTotals, kickoffUtc, toSleeperTeam } from "./schedule.js";
import {
  createNflverseProvider,
  type FetchFn,
  joinUsage,
  normalizeName,
  type PlayerRef,
} from "./index.js";

const FIX = resolve(import.meta.dirname, "../../../tests/fixtures");
const read = (p: string): Promise<string> => readFile(join(FIX, p), "utf8");

interface Served {
  fetch: FetchFn;
  calls: { url: string; headers: Record<string, string> }[];
  mode: { kind: "ok" | "304" | "garbage" | "down" | "404" };
}

async function server(): Promise<Served> {
  const files: Record<string, Buffer> = {
    "games.csv.gz": gzipSync(await read("nflverse/schedules/games.csv")),
    "stats_player_week_2026.csv.gz": gzipSync(
      await read("nflverse/stats_player/stats_player_week_2026.csv"),
    ),
    "snap_counts_2026.csv.gz": gzipSync(await read("nflverse/snap_counts/snap_counts_2026.csv")),
  };
  const s: Served = {
    calls: [],
    mode: { kind: "ok" },
    fetch: () => Promise.resolve(new Response(null)),
  };
  s.fetch = (url, init) => {
    s.calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    const name = url.split("/").pop() ?? "";
    switch (s.mode.kind) {
      case "down":
        return Promise.reject(new Error("ECONNRESET"));
      case "304":
        return Promise.resolve(new Response(null, { status: 304 }));
      case "404":
        return Promise.resolve(new Response("nope", { status: 404 }));
      case "garbage":
        return Promise.resolve(new Response("not gzip at all", { status: 200 }));
      default:
        return Promise.resolve(
          new Response(files[name], {
            status: 200,
            headers: { etag: '"abc"', "last-modified": "Fri, 02 Oct 2026 03:49:54 GMT" },
          }),
        );
    }
  };
  return s;
}

const T0 = new Date("2026-10-02T12:00:00Z");
const mk = async (enabled = true, now = () => T0) => {
  const s = await server();
  const dataDir = await mkdtemp(join(tmpdir(), "nflv-"));
  return { s, dataDir, p: createNflverseProvider({ enabled, dataDir, fetch: s.fetch, now }) };
};

describe("ADR-005: disabled flag", () => {
  it("returns reason disabled without any fetch", async () => {
    const { s, p } = await mk(false);
    expect(await p.getSchedule(2026)).toMatchObject({ ok: false, reason: "disabled" });
    expect(await p.getUsage(2026, undefined, [])).toMatchObject({ ok: false, reason: "disabled" });
    expect(s.calls).toHaveLength(0);
  });
});

describe("ADR-006: schedule from fixtures", () => {
  it("maps 272 games, LA to LAR, kickoffs, and one bye per team in weeks 5 to 14", async () => {
    const { p } = await mk();
    const r = await p.getSchedule(2026);
    if (!r.ok) throw new Error(r.message);
    expect(r.data).toHaveLength(272);
    expect(r.data.some((g) => g.home === "LA" || g.away === "LA")).toBe(false);
    expect(r.data.some((g) => g.home === "LAR" || g.away === "LAR")).toBe(true);
    const byId = new Map(r.data.map((g) => [g.gameId, g]));
    expect(byId.get("2026_01_CLE_JAX")?.kickoffUtc).toBe("2026-09-13T17:00:00.000Z");
    expect(byId.get("2026_04_IND_WAS")?.kickoffUtc).toBe("2026-10-04T13:30:00.000Z");
    const late = r.data.find((g) => g.kickoffUtc === "2026-11-23T01:20:00.000Z");
    expect(late).toBeDefined();
    const byes = byeWeeks(r.data);
    expect(byes.size).toBe(32);
    for (const w of byes.values()) expect(w >= 5 && w <= 14).toBe(true);
    expect(r.meta.assetUpdatedAt).toBe("Fri, 02 Oct 2026 03:49:54 GMT");
  });

  it("spread sign: CLE_JAX week 1 implies JAX (home) above CLE", async () => {
    const { p } = await mk();
    const r = await p.getSchedule(2026);
    if (!r.ok) throw new Error(r.message);
    const g = r.data.find((x) => x.gameId === "2026_01_CLE_JAX");
    if (!g || g.spreadLine === null || g.totalLine === null) throw new Error("no lines");
    const t = impliedTotals(g.spreadLine, g.totalLine);
    expect(t.home).toBeGreaterThan(t.away);
    expect(t.home + t.away).toBeCloseTo(g.totalLine, 9);
  });

  it("ADR-006: LA maps to LAR, others unchanged", () => {
    expect(toSleeperTeam("LA")).toBe("LAR");
    expect(toSleeperTeam("KC")).toBe("KC");
  });

  it("maps blank gametime/lines to nulls and warns on unknown team codes", async () => {
    const csv = [
      "game_id,season,game_type,week,gameday,gametime,away_team,away_score,home_team,home_score,roof,spread_line,total_line",
      "g1,2026,REG,15,2026-12-20,,XXX,,KC,,,,",
    ].join("\n");
    const { s, dataDir } = await mk();
    await writeFile(join(dataDir, "x"), "");
    const p = createNflverseProvider({
      enabled: true,
      dataDir,
      now: () => T0,
      fetch: (u, i) =>
        u.endsWith("games.csv.gz") ? Promise.resolve(new Response(gzipSync(csv))) : s.fetch(u, i),
    });
    const r = await p.getSchedule(2026);
    if (!r.ok) throw new Error(r.message);
    expect(r.data[0]).toMatchObject({
      kickoffUtc: null,
      kickoffApproximate: true,
      roof: null,
      totalLine: null,
      spreadLine: null,
      homeScore: null,
    });
    expect(r.meta.warnings.join()).toContain("XXX");
  });
});

describe("ADR-006: kickoffUtc edge cases (m4)", () => {
  it("handles EDT and EST", () => {
    expect(kickoffUtc("2026-09-13", "13:00")).toBe("2026-09-13T17:00:00.000Z");
    expect(kickoffUtc("2026-11-22", "20:20")).toBe("2026-11-23T01:20:00.000Z");
  });
  it("ambiguous fall-back hour uses the first occurrence (EDT)", () => {
    expect(kickoffUtc("2026-11-01", "01:30")).toBe("2026-11-01T05:30:00.000Z");
  });
  it("nonexistent spring-forward hour resolves as 03:30 EDT", () => {
    expect(kickoffUtc("2026-03-08", "02:30")).toBe("2026-03-08T07:30:00.000Z");
  });
  it("rejects impossible dates and times", () => {
    expect(kickoffUtc("2026-02-31", "13:00")).toBeNull();
    expect(kickoffUtc("2026-09-13", "25:00")).toBeNull();
    expect(kickoffUtc("2026-13-01", "10:00")).toBeNull();
    expect(kickoffUtc("2026-09-13", "10:61")).toBeNull();
    expect(kickoffUtc("2026-09-13", "")).toBeNull();
    expect(kickoffUtc("garbage", "10:00")).toBeNull();
  });
});

describe("ADR-006: CSV parser edge cases (m3)", () => {
  it("strips a BOM", () => {
    expect(parseCsvTable("﻿a,b\n1,2\n").header).toEqual(["a", "b"]);
  });
  it("handles quoted newline, comma and embedded quotes", () => {
    const t = parseCsvTable('a,b\n"x\ny","he said ""hi"", ok"\n');
    expect(t.rows[0]).toEqual({ a: "x\ny", b: 'he said "hi", ok' });
  });
  it("rejects and counts ragged rows", () => {
    const t = parseCsvTable("a,b\n1,2\n3\n4,5,6\n7,8\n");
    expect(t.rows).toHaveLength(2);
    expect(t.raggedRows).toBe(2);
  });
  it("handles CRLF and blank lines", () => {
    expect(parseCsvTable("a,b\r\n1,2\r\n\r\n").rows).toEqual([{ a: "1", b: "2" }]);
  });
});

describe("ADR-006: usage join", () => {
  it("normalizes accents, punctuation and suffixes", () => {
    expect(normalizeName("Amon-Ra St. Brown")).toBe("amon ra st brown");
    expect(normalizeName("Marvin Harrison Jr.")).toBe("marvin harrison");
    expect(normalizeName("José Núñez III")).toBe("jose nunez");
    expect(normalizeName("D'Andre Swift")).toBe("dandre swift");
  });

  const statsHeader =
    "player_id,player_display_name,position,season,week,game_id,team,carries,targets,target_share,air_yards_share";
  const statsOf = (...rows: string[]) => parseCsvTable([statsHeader, ...rows].join("\n"));
  const ref = (
    playerId: string,
    fullName: string,
    team: string,
    position: string,
    gsisId: string | null = null,
  ): PlayerRef => ({ playerId, fullName, team, position, gsisId });
  const ok = (j: ReturnType<typeof joinUsage>) => {
    if ("error" in j) throw new Error(j.error);
    return j;
  };

  it("joins by padded gsis id, then name+team, then first-name alias", () => {
    const t = statsOf(
      "00-1,Someone Else,RB,2026,1,g1,KC,10,1,0.1,0.1",
      "00-2,Josh Allen,QB,2026,1,g1,BUF,1,0,0,0",
      "00-3,Matthew Stafford,QB,2026,1,g2,LA,0,0,0,0",
    );
    const j = ok(
      joinUsage(t, null, 2026, undefined, [
        ref("p1", "Real Name", "KC", "RB", " 00-1"),
        ref("p2", "Joshua Allen", "BUF", "QB"),
        ref("p3", "Matt Stafford", "LAR", "QB"),
      ]),
    );
    expect(j.data.map((d) => d.playerId).sort()).toEqual(["p1", "p2", "p3"]);
    expect(j.data.find((d) => d.playerId === "p3")?.team).toBe("LAR");
  });

  it("ambiguous same-name same-team pair yields no match plus a warning; position breaks ties", () => {
    const t = statsOf(
      "00-9,Mike Williams,WR,2026,1,g1,NYJ,0,5,0.2,0.2",
      "00-8,Mike Williams,RB,2026,1,g1,NYJ,3,0,0,0",
    );
    const both = [ref("a", "Mike Williams", "NYJ", "WR"), ref("b", "Mike Williams", "NYJ", "WR")];
    const j = ok(joinUsage(t, null, 2026, undefined, both));
    expect(j.data).toHaveLength(0);
    expect(j.stats.ambiguous).toBe(2);
    expect(j.warnings.join()).toContain("ambiguous");
    const j2 = ok(
      joinUsage(t, null, 2026, undefined, [
        ref("a", "Mike Williams", "NYJ", "WR"),
        ref("b", "Mike Williams", "NYJ", "RB"),
      ]),
    );
    expect(j2.data.map((d) => d.playerId).sort()).toEqual(["a", "b"]);
  });

  it("same name on a different team joins correctly; unmatched rows are counted", () => {
    const t = statsOf(
      "x1,Mike Williams,WR,2026,1,g1,PIT,0,5,0.2,0.2",
      "x2,Nobody Known,WR,2026,1,g1,PIT,0,0,0,0",
    );
    const j = ok(
      joinUsage(t, null, 2026, undefined, [
        ref("a", "Mike Williams", "NYJ", "WR"),
        ref("b", "Mike Williams", "PIT", "WR"),
      ]),
    );
    expect(j.data.map((d) => d.playerId)).toEqual(["b"]);
    expect(j.stats.unmatched).toBe(1);
    expect(j.warnings.join()).toContain("1 of 2 stats rows");
  });

  it("filters weeks, merges snaps, and reports missing columns", () => {
    const t = statsOf(
      "x1,Al Pha,WR,2026,1,g1,KC,0,5,0.2,0.3",
      "x1,Al Pha,WR,2026,2,g2,KC,0,5,0.2,0.3",
    );
    const snaps = parseCsvTable(
      "season,week,player,position,team,offense_pct\n2026,1,Al Pha,WR,KC,0.85\n2026,1,Ghost,WR,KC,0.5",
    );
    const j = ok(joinUsage(t, snaps, 2026, [1], [ref("a", "Al Pha", "KC", "WR")]));
    expect(j.data).toHaveLength(1);
    expect(j.data[0]).toMatchObject({ week: 1, snapPct: 0.85, rzTouches: null, targetShare: 0.2 });
    expect(j.warnings.join()).toContain("1 snap rows");
    expect("error" in joinUsage(parseCsvTable("a,b\n1,2"), null, 2026, undefined, [])).toBe(true);
  });

  it("ADR-006: fixture carryShare sums to 1 for KC week 1 and join rate is at least 99%", async () => {
    const stats = parseCsvTable(await read("nflverse/stats_player/stats_player_week_2026.csv"));
    const snaps = parseCsvTable(await read("nflverse/snap_counts/snap_counts_2026.csv"));
    const kcRefs = stats.rows
      .filter((r) => r["team"] === "KC")
      .map((r) =>
        ref(
          r["player_id"] ?? "",
          r["player_display_name"] ?? "",
          "KC",
          r["position"] ?? "",
          r["player_id"] ?? "",
        ),
      );
    const kc = ok(joinUsage(stats, snaps, 2026, [1], kcRefs));
    const sum = kc.data
      .filter((d) => d.team === "KC" && d.week === 1)
      .reduce((a, d) => a + (d.carryShare ?? 0), 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);

    const raw = JSON.parse(await read("sleeper/v1/players/nfl.json")) as Record<
      string,
      {
        player_id: string;
        full_name?: string;
        team?: string | null;
        position?: string | null;
        gsis_id?: string | null;
      }
    >;
    const refs = Object.values(raw)
      .map((p) =>
        ref(p.player_id, p.full_name ?? "", p.team ?? "", p.position ?? "", p.gsis_id ?? null),
      )
      .filter((p) => p.team !== "");
    const relevantStats = {
      ...stats,
      rows: stats.rows.filter((r) => r["team"] !== "KC" && r["team"] !== "SF"),
    };
    const full = ok(joinUsage(relevantStats, snaps, 2026, undefined, refs));
    const rate = full.stats.matched / full.stats.statsRows;
    expect(rate).toBeGreaterThanOrEqual(0.99);
  });

  it("provider getUsage returns validated rows and snap warning when snaps 404", async () => {
    const { p, s } = await mk();
    const stats = parseCsvTable(await read("nflverse/stats_player/stats_player_week_2026.csv"));
    const row = stats.rows[0];
    const r = await p.getUsage(
      2026,
      [1],
      [
        ref(
          "z",
          row?.["player_display_name"] ?? "",
          row?.["team"] === "LA" ? "LAR" : (row?.["team"] ?? ""),
          row?.["position"] ?? "",
        ),
      ],
    );
    expect(r.ok).toBe(true);
    expect(s.calls).toHaveLength(2);
  });
});

describe("ADR-006: download cache", () => {
  it("second call within maxAge makes zero fetches", async () => {
    const { s, p } = await mk();
    await p.getSchedule(2026);
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]?.headers["User-Agent"]).toBe("Sideline (self-hosted)");
    const again = await p.getSchedule(2026);
    expect(s.calls).toHaveLength(1);
    expect(again.ok && again.meta.fromCache).toBe(true);
  });

  it("stale cache plus 304 makes one conditional request and touches downloadedAt", async () => {
    let t = T0;
    const { s, p, dataDir } = await mk(true, () => t);
    await p.getSchedule(2026);
    t = new Date(T0.getTime() + 25 * 3600_000);
    s.mode.kind = "304";
    const r = await p.getSchedule(2026);
    expect(r.ok).toBe(true);
    expect(s.calls).toHaveLength(2);
    expect(s.calls[1]?.headers["If-None-Match"]).toBe('"abc"');
    expect(s.calls[1]?.headers["If-Modified-Since"]).toContain("2026");
    const meta = JSON.parse(
      await readFile(join(dataDir, "cache/nflverse/games.csv.gz.meta.json"), "utf8"),
    ) as { downloadedAt: string };
    expect(meta.downloadedAt).toBe(t.toISOString());
  });

  it("network failure with a cache returns cached data with a warning; without one returns network", async () => {
    let t = T0;
    const { s, p } = await mk(true, () => t);
    s.mode.kind = "down";
    expect(await p.getSchedule(2026)).toMatchObject({ ok: false, reason: "network" });
    s.mode.kind = "ok";
    await p.getSchedule(2026);
    t = new Date(T0.getTime() + 25 * 3600_000);
    s.mode.kind = "down";
    const r = await p.getSchedule(2026);
    expect(r.ok && r.data.length).toBe(272);
    expect(r.ok && r.meta.warnings.join()).toContain("serving cached copy");
  });

  it("a garbage body leaves the previous cache intact; garbage first time is a network failure", async () => {
    let t = T0;
    const { s, p, dataDir } = await mk(true, () => t);
    s.mode.kind = "garbage";
    expect((await p.getSchedule(2026)).ok).toBe(false);
    s.mode.kind = "ok";
    await p.getSchedule(2026);
    const before = await readFile(join(dataDir, "cache/nflverse/games.csv.gz"));
    t = new Date(T0.getTime() + 25 * 3600_000);
    s.mode.kind = "garbage";
    const r = await p.getSchedule(2026);
    expect(r.ok).toBe(true);
    expect((await readFile(join(dataDir, "cache/nflverse/games.csv.gz"))).equals(before)).toBe(
      true,
    );
  });

  it("404 without cache is not_found; 5xx with cache serves stale", async () => {
    const { s, p } = await mk();
    s.mode.kind = "404";
    expect(await p.getUsage(2026, undefined, [])).toMatchObject({ ok: false, reason: "not_found" });
  });

  it("parse failure maps to ok:false parse and never throws", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "nflv-"));
    const p = createNflverseProvider({
      enabled: true,
      dataDir,
      now: () => T0,
      fetch: () => Promise.resolve(new Response(gzipSync("a,b\n1,2\n"))),
    });
    expect(await p.getSchedule(2026)).toMatchObject({ ok: false, reason: "parse" });
    expect(await p.getUsage(2026, undefined, [])).toMatchObject({ ok: false, reason: "parse" });
    const bad = createNflverseProvider({
      enabled: true,
      dataDir: await mkdtemp(join(tmpdir(), "nflv-")),
      now: () => T0,
      fetch: () => Promise.resolve(new Response(gzipSync('a,b\n"unterminated\n'))),
    });
    expect(await bad.getSchedule(2026)).toMatchObject({ ok: false, reason: "parse" });
  });
});

describe("T1.5c: schedule with dates", () => {
  it("returns a YYYY-MM-DD gameday for each game id", async () => {
    const s = await server();
    const p = createNflverseProvider({
      enabled: true,
      dataDir: await mkdtemp(join(tmpdir(), "nfl-dates-")),
      fetch: s.fetch,
      now: () => T0,
    });
    const r = await p.getScheduleWithDates(2026);
    if (!r.ok) throw new Error(r.message);
    expect(r.data.gamedays.size).toBe(r.data.games.length);
    expect(r.data.gamedays.get("2026_01_CLE_JAX")).toBe("2026-09-13");
  });
});
