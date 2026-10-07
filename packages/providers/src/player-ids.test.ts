import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type FetchFn, getPlayerIdCrosswalk } from "./index.js";
import { gzipping } from "./player-ids.js";

const CSV = [
  "name,espn_id,position,sleeper_id,gsis_id",
  "A One,111,QB,1001,00-1",
  "B Two,NA,RB,1002,00-2",
  "C Three, 333 ,WR,1003,00-3",
  "D Four,444,TE,NA,00-4",
  "E Five,abc,TE,1005,00-5",
  "F Six,666,WR,1006,00-6",
  "F Six,667,WR,1006,00-6",
  "G Seven,777,WR,1007,00-7",
  "G Seven,777,WR,1007,00-7",
].join("\n");

async function setup(handler: () => Response | Promise<Response>) {
  const dataDir = await mkdtemp(join(tmpdir(), "pids-"));
  let calls = 0;
  const fetch: FetchFn = () => {
    calls += 1;
    return Promise.resolve(handler());
  };
  let t = Date.parse("2026-10-01T12:00:00Z");
  return {
    run: () => getPlayerIdCrosswalk({ dataDir, fetch, now: () => new Date(t) }),
    advance: (ms: number) => (t += ms),
    calls: () => calls,
  };
}

describe("getPlayerIdCrosswalk", () => {
  it("parses by header name, skips NA/non-numeric, trims, drops conflicts with a warning", async () => {
    const s = await setup(() => new Response(CSV));
    const r = await s.run();
    if (!r.ok) throw new Error(r.message);
    expect([...r.data.entries()].sort()).toEqual([
      ["1001", "111"],
      ["1003", "333"],
      ["1007", "777"],
    ]);
    expect(r.meta.warnings.join(" ")).toContain("1006");
  });

  it("drops every sleeper id sharing one espn id, with one warning", async () => {
    const csv = "espn_id,sleeper_id\n5,10\n5,11\n5,12\n6,13\n";
    const s = await setup(() => new Response(csv));
    const r = await s.run();
    if (!r.ok) throw new Error(r.message);
    expect([...r.data.entries()]).toEqual([["13", "6"]]);
    expect(r.meta.warnings.filter((w) => w.includes("espn id 5"))).toHaveLength(1);
  });

  it("gzip wrapper builds fresh headers keeping only etag and last-modified", async () => {
    const wrapped = gzipping(() =>
      Promise.resolve(
        new Response("a,b\n1,2\n", {
          headers: {
            "content-length": "9",
            "content-encoding": "identity",
            "content-type": "text/csv",
            etag: '"abc"',
            "last-modified": "Wed, 01 Oct 2026 00:00:00 GMT",
          },
        }),
      ),
    );
    const res = await wrapped("http://x");
    expect(res.headers.get("content-length")).toBeNull();
    expect(res.headers.get("content-encoding")).toBeNull();
    expect(res.headers.get("content-type")).toBeNull();
    expect(res.headers.get("etag")).toBe('"abc"');
    expect(res.headers.get("last-modified")).toBe("Wed, 01 Oct 2026 00:00:00 GMT");
  });

  it("fails cleanly on HTTP 500", async () => {
    const s = await setup(() => new Response("x", { status: 500 }));
    expect(await s.run()).toMatchObject({ ok: false, reason: "network" });
  });

  it("fails cleanly on timeout", async () => {
    const s = await setup(() => {
      throw new DOMException("timed out", "TimeoutError");
    });
    expect(await s.run()).toMatchObject({ ok: false, reason: "network" });
  });

  it("fails when espn_id column is missing", async () => {
    const s = await setup(() => new Response("name,sleeper_id\nA,1\n"));
    expect(await s.run()).toMatchObject({ ok: false, reason: "parse" });
  });

  it("serves a second call within 24h from cache", async () => {
    const s = await setup(() => new Response(CSV));
    await s.run();
    s.advance(2 * 3_600_000);
    const r = await s.run();
    expect(s.calls()).toBe(1);
    expect(r.ok && r.meta.fromCache).toBe(true);
  });
});
