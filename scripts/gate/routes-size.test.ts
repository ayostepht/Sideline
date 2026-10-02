import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectRouteSizes,
  computeRouteSizes,
  normalizeChunk,
  parseClientManifest,
  ROUTE_JS_BUDGET_BYTES,
  routeJsFiles,
  routesOverBudget,
} from "./routes-size.js";

// Shape copied from a real `next build` (Next 16, Turbopack): server/app/page_client-reference-manifest.js
const SAMPLE_MANIFEST = `globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};
globalThis.__RSC_MANIFEST["/page"] = ${JSON.stringify({
  moduleLoading: { prefix: "" },
  clientModules: {
    "[project]/next/layout-router.js": {
      id: 1,
      name: "*",
      chunks: ["/_next/static/chunks/aaa.js"],
      async: false,
    },
    "[project]/next/client-page.js": {
      id: 2,
      name: "*",
      chunks: ["/_next/static/chunks/aaa.js", "/_next/static/chunks/bbb.js"],
      async: false,
    },
  },
  entryCSSFiles: { "[project]/app/layout": ["static/chunks/style.css"] },
  entryJSFiles: { "[project]/app/layout": ["static/chunks/aaa.js"] },
})};`;

describe("route JS sizes", () => {
  it("normalizes chunk paths", () => {
    expect(normalizeChunk("/_next/static/chunks/a.js")).toBe("static/chunks/a.js");
    expect(normalizeChunk("static/chunks/a.js")).toBe("static/chunks/a.js");
  });

  it("parses a client reference manifest and collects unique JS files with the root chunks", () => {
    const manifest = parseClientManifest(SAMPLE_MANIFEST);
    expect(manifest).toBeDefined();
    if (manifest === undefined) return;
    const files = routeJsFiles(["static/chunks/root.js", "static/chunks/turbopack.js"], manifest);
    expect(files).toEqual([
      "static/chunks/aaa.js",
      "static/chunks/bbb.js",
      "static/chunks/root.js",
      "static/chunks/turbopack.js",
    ]);
  });

  it("returns undefined for a manifest that does not parse", () => {
    expect(parseClientManifest("this is not javascript (")).toBeUndefined();
    expect(parseClientManifest("var x = 1;")).toBeUndefined();
  });

  it("sums gzipped sizes per route and applies the 204800 byte budget", () => {
    const content: Record<string, string> = {
      "a.js": "a".repeat(5000),
      "b.js": "b".repeat(5000),
    };
    const sizeOf = (f: string): number => gzipSync(content[f] ?? "").length;
    const sizes = computeRouteSizes({ "/": ["a.js", "b.js"], "/big": ["a.js"] }, sizeOf);
    expect(sizes.map((s) => s.route)).toEqual(["/", "/big"]);
    expect(sizes[0]?.gzipBytes).toBe(sizeOf("a.js") + sizeOf("b.js"));
    expect(routesOverBudget(sizes)).toEqual([]);
    expect(
      routesOverBudget([{ route: "/x", files: 1, gzipBytes: ROUTE_JS_BUDGET_BYTES + 1 }]).map(
        (s) => s.route,
      ),
    ).toEqual(["/x"]);
    expect(routesOverBudget([{ route: "/y", files: 1, gzipBytes: ROUTE_JS_BUDGET_BYTES }])).toEqual(
      [],
    );
  });
});

describe("collectRouteSizes with a fixture build dir", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function makeBuild(opts: { missing?: string; broken?: string }): string {
    const dir = mkdtempSync(path.join(tmpdir(), "routes-size-"));
    dirs.push(dir);
    const write = (rel: string, content: string): void => {
      mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      writeFileSync(path.join(dir, rel), content);
    };
    write("build-manifest.json", JSON.stringify({ rootMainFiles: ["static/chunks/root.js"] }));
    write("static/chunks/root.js", "root();");
    write("static/chunks/aaa.js", "aaa();");
    write(
      "app-path-routes-manifest.json",
      JSON.stringify({
        "/page": "/",
        "/lineup/page": "/lineup",
        "/api/health/route": "/api/health",
      }),
    );
    write("server/app/page_client-reference-manifest.js", SAMPLE_MANIFEST);
    if (opts.missing !== "/lineup/page") {
      write(
        "server/app/lineup/page_client-reference-manifest.js",
        opts.broken === "/lineup/page" ? "this is not javascript (" : SAMPLE_MANIFEST,
      );
    }
    write("static/chunks/bbb.js", "bbb();");
    return dir;
  }

  it("measures every page route and ignores route handlers", () => {
    const sizes = collectRouteSizes(makeBuild({}));
    expect(sizes.map((s) => s.route)).toEqual(["/", "/lineup"]);
    expect(sizes.every((s) => s.gzipBytes > 0)).toBe(true);
  });

  it("resolves percent-encoded dynamic route keys to bracket files on disk", () => {
    const dir = makeBuild({});
    const write = (rel: string, content: string): void => {
      mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      writeFileSync(path.join(dir, rel), content);
    };
    write(
      "app-path-routes-manifest.json",
      JSON.stringify({
        "/page": "/",
        "/l/%5BleagueId%5D/page": "/l/[leagueId]",
        "/l/%5BleagueId%5D/league/teams/%5BrosterId%5D/page":
          "/l/[leagueId]/league/teams/[rosterId]",
      }),
    );
    write("server/app/l/[leagueId]/page_client-reference-manifest.js", SAMPLE_MANIFEST);
    write(
      "server/app/l/[leagueId]/league/teams/[rosterId]/page_client-reference-manifest.js",
      SAMPLE_MANIFEST,
    );
    write("static/chunks/app/l/[leagueId]/error-x.js", "err();");
    write(
      "server/app/l/[leagueId]/page_client-reference-manifest.js",
      SAMPLE_MANIFEST.replace(
        "/_next/static/chunks/bbb.js",
        "/_next/static/chunks/app/l/%5BleagueId%5D/error-x.js",
      ),
    );
    const sizes = collectRouteSizes(dir);
    expect(sizes.map((s) => s.route)).toEqual([
      "/",
      "/l/[leagueId]",
      "/l/[leagueId]/league/teams/[rosterId]",
    ]);
  });

  it("throws naming the route when a client manifest is missing", () => {
    expect(() => collectRouteSizes(makeBuild({ missing: "/lineup/page" }))).toThrow(/\/lineup/);
  });

  it("throws naming the route when a client manifest cannot be parsed", () => {
    expect(() => collectRouteSizes(makeBuild({ broken: "/lineup/page" }))).toThrow(
      /\/lineup.*could not be parsed/,
    );
  });
});
