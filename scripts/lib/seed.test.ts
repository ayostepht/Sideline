import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { planDataDir } from "../screens/datadir.js";
import { lanIPv4 } from "./lan.js";
import { redactHome } from "./paths.js";
import {
  assertSeededDataDir,
  FIXTURE_LEAGUE_ID,
  isCaseInsensitivePlatform,
  isInside,
  SEED_MARKER,
} from "./seed.js";

const made: string[] = [];
function temp(): string {
  const d = mkdtempSync(path.join(tmpdir(), "seed-test-"));
  made.push(d);
  return d;
}
afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});
function marker(dir: string, body: unknown): void {
  writeFileSync(path.join(dir, SEED_MARKER), JSON.stringify(body));
}

describe("assertSeededDataDir", () => {
  it("refuses ./data", () => {
    const root = temp();
    mkdirSync(path.join(root, "data"));
    marker(path.join(root, "data"), { leagueId: FIXTURE_LEAGUE_ID, seededAt: "x" });
    expect(() => assertSeededDataDir(path.join(root, "data"), root)).toThrow(/real data/);
  });
  it("refuses a dir under ./data, even with a marker", () => {
    const root = temp();
    const sub = path.join(root, "data", "nested");
    mkdirSync(sub, { recursive: true });
    marker(sub, { leagueId: FIXTURE_LEAGUE_ID, seededAt: "x" });
    expect(() => assertSeededDataDir(sub, root)).toThrow(/real data/);
  });
  it("refuses case variants of ./data (existing and not yet created)", () => {
    const root = temp();
    mkdirSync(path.join(root, "data", "nested"), { recursive: true });
    const insensitiveFs = isCaseInsensitivePlatform();
    if (insensitiveFs) {
      expect(() => assertSeededDataDir(path.join(root, "DATA", "nested"), root)).toThrow(
        /real data/,
      );
      expect(() => assertSeededDataDir(path.join(root, "Data", "new-leaf"), root)).toThrow(
        /real data/,
      );
    }
    // Platform rule, independent of the test machine's filesystem.
    expect(isInside("/r/DATA/x", "/r/data", true)).toBe(true);
    expect(isInside("/r/DATA/x", "/r/data", false)).toBe(false);
    expect(isCaseInsensitivePlatform("darwin")).toBe(true);
    expect(isCaseInsensitivePlatform("win32")).toBe(true);
    expect(isCaseInsensitivePlatform("linux")).toBe(false);
  });
  it("refuses a temp dir without the marker", () => {
    expect(() => assertSeededDataDir(temp(), temp())).toThrow(/no .*marker/);
  });
  it("refuses a bad marker and a marker for another league", () => {
    const dir = temp();
    writeFileSync(path.join(dir, SEED_MARKER), "not json");
    expect(() => assertSeededDataDir(dir, temp())).toThrow(/unreadable/);
    marker(dir, { leagueId: "123", seededAt: "x" });
    expect(() => assertSeededDataDir(dir, temp())).toThrow(/not for the fake/);
  });
  it("accepts a properly seeded dir", () => {
    const dir = temp();
    marker(dir, { leagueId: FIXTURE_LEAGUE_ID, seededAt: new Date().toISOString() });
    expect(() => assertSeededDataDir(dir, temp())).not.toThrow();
  });
});

describe("planDataDir", () => {
  const base = { root: "/repo", dataDirFlag: undefined, unverified: false };
  it("refuses external mode without --unverified", () => {
    expect(() => planDataDir({ ...base, env: { E2E_BASE_URL: "http://x" } })).toThrow(
      /unverified/i,
    );
  });
  it("allows external mode with --unverified", () => {
    expect(planDataDir({ ...base, unverified: true, env: { E2E_BASE_URL: "http://x" } })).toEqual({
      kind: "unverified",
    });
  });
  it("seeds when no DATA_DIR is given", () => {
    expect(planDataDir({ ...base, env: {} })).toEqual({ kind: "seed" });
  });
  it("validates a given DATA_DIR", () => {
    expect(() => planDataDir({ ...base, env: { DATA_DIR: "/repo/data" } })).toThrow(/real data/);
  });
});

describe("redactHome", () => {
  it("rewrites the home directory to ~", () => {
    expect(redactHome('{"p":"/Users/jo/x/chrome"}', "/Users/jo")).toBe('{"p":"~/x/chrome"}');
  });
  it("only replaces the home prefix at a path boundary", () => {
    expect(redactHome("/Users/stephanie2/x", "/Users/steph")).toBe("/Users/stephanie2/x");
    expect(redactHome("/Users/steph/x and /Users/steph", "/Users/steph")).toBe("~/x and ~");
  });
  it("leaves text alone when home is empty", () => {
    expect(redactHome("/a/b", "")).toBe("/a/b");
  });
});

describe("lanIPv4", () => {
  it("picks the first non-internal IPv4", () => {
    const addr = (address: string, internal: boolean, family: "IPv4" | "IPv6") => ({
      address,
      internal,
      family,
    });
    expect(
      lanIPv4({
        lo0: [addr("127.0.0.1", true, "IPv4")],
        en0: [addr("fe80::1", false, "IPv6"), addr("192.168.1.20", false, "IPv4")],
      }),
    ).toBe("192.168.1.20");
    expect(lanIPv4({})).toBeUndefined();
  });
});
