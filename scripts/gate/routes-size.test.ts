import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
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
