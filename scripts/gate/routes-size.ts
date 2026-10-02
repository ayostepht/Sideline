import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { gzipSync } from "node:zlib";
import { z } from "zod";

/** PLAN.md 6.6: route JS at most 200 KB gzipped. */
export const ROUTE_JS_BUDGET_BYTES = 204_800;

const BuildManifestSchema = z.object({ rootMainFiles: z.array(z.string()).optional() });
const PathManifestSchema = z.record(z.string(), z.string());
const ClientManifestSchema = z.object({
  entryJSFiles: z.record(z.string(), z.array(z.string())).optional(),
  clientModules: z
    .record(z.string(), z.object({ chunks: z.array(z.string()).optional() }))
    .optional(),
});
export type ClientManifest = z.infer<typeof ClientManifestSchema>;

export interface RouteSize {
  route: string;
  files: number;
  gzipBytes: number;
}

/** "/_next/static/chunks/a.js" and "static/chunks/a.js" both become "static/chunks/a.js". */
export function normalizeChunk(chunk: string): string {
  return chunk.replace(/^\/?_next\//, "").replace(/^\//, "");
}

/**
 * First-load JS files for one route: the shared root chunks plus every chunk the route's
 * client manifest references. Polyfills are left out (nomodule, not downloaded by modern
 * browsers, and Next excludes them from its own First Load figure). CSS is not JS.
 */
export function routeJsFiles(rootMainFiles: readonly string[], manifest: ClientManifest): string[] {
  const files = new Set<string>();
  const add = (chunk: string): void => {
    const normalized = normalizeChunk(chunk);
    if (normalized.endsWith(".js")) files.add(normalized);
  };
  rootMainFiles.forEach(add);
  for (const list of Object.values(manifest.entryJSFiles ?? {})) list.forEach(add);
  for (const mod of Object.values(manifest.clientModules ?? {})) (mod.chunks ?? []).forEach(add);
  return [...files].sort();
}

/**
 * Parses a `page_client-reference-manifest.js` file. It assigns
 * `globalThis.__RSC_MANIFEST["/route"] = {...}`; running it in an empty VM context reads the
 * object without touching the real global scope.
 */
export function parseClientManifest(source: string): ClientManifest | undefined {
  const sandbox: Record<string, unknown> = {};
  try {
    vm.runInNewContext(source, sandbox, { timeout: 2000 });
  } catch {
    return undefined;
  }
  const rsc = z.record(z.string(), z.unknown()).safeParse(sandbox["__RSC_MANIFEST"]);
  if (!rsc.success) return undefined;
  const first = Object.values(rsc.data)[0];
  const parsed = ClientManifestSchema.safeParse(first);
  return parsed.success ? parsed.data : undefined;
}

/** Sums gzipped sizes per route. `sizeOf` returns the gzipped byte size of a build-relative file. */
export function computeRouteSizes(
  routes: Readonly<Record<string, readonly string[]>>,
  sizeOf: (file: string) => number,
): RouteSize[] {
  return Object.entries(routes)
    .map(([route, files]) => ({
      route,
      files: files.length,
      gzipBytes: files.reduce((sum, file) => sum + sizeOf(file), 0),
    }))
    .sort((a, b) => a.route.localeCompare(b.route));
}

export function routesOverBudget(
  sizes: readonly RouteSize[],
  budget = ROUTE_JS_BUDGET_BYTES,
): RouteSize[] {
  return sizes.filter((s) => s.gzipBytes > budget);
}

/** Reads a finished `next build` output (apps/web/.next) and measures every page route. */
export function collectRouteSizes(nextDir: string): RouteSize[] {
  const readJson = (rel: string): unknown =>
    JSON.parse(readFileSync(path.join(nextDir, rel), "utf8"));
  const build = BuildManifestSchema.parse(readJson("build-manifest.json"));
  const pathManifest = PathManifestSchema.parse(readJson("app-path-routes-manifest.json"));
  const rootMain = build.rootMainFiles ?? [];
  const routes: Record<string, string[]> = {};
  for (const [key, route] of Object.entries(pathManifest)) {
    if (!key.endsWith("/page")) continue; // skip route handlers (API) and other entry types
    const manifestFile = path.join(nextDir, "server/app", `${key}_client-reference-manifest.js`);
    // A route we cannot measure must fail the budget check, never slip past it.
    if (!existsSync(manifestFile)) {
      throw new Error(`route ${route}: client reference manifest is missing (${key})`);
    }
    const manifest = parseClientManifest(readFileSync(manifestFile, "utf8"));
    if (manifest === undefined) {
      throw new Error(`route ${route}: client reference manifest could not be parsed (${key})`);
    }
    routes[route] = routeJsFiles(rootMain, manifest);
  }
  const cache = new Map<string, number>();
  const sizeOf = (file: string): number => {
    const cached = cache.get(file);
    if (cached !== undefined) return cached;
    const full = path.join(nextDir, file);
    if (!existsSync(full)) throw new Error(`build output references a missing file: ${file}`);
    const size = gzipSync(readFileSync(full)).length;
    cache.set(file, size);
    return size;
  };
  return computeRouteSizes(routes, sizeOf);
}
