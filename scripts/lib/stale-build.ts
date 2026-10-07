import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const SKIP_DIRS = new Set([".next", "node_modules", ".turbo", "dist", "coverage"]);
const SKIP_FILES = new Set(["next-env.d.ts", "tsconfig.tsbuildinfo"]);

/** Newest mtime (ms) of any source file under `dir`, skipping build output. 0 when none. */
export function newestMtime(dir: string): number {
  if (!existsSync(dir)) return 0;
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) newest = Math.max(newest, newestMtime(full));
    } else if (entry.isFile() && !SKIP_FILES.has(entry.name)) {
      newest = Math.max(newest, statSync(full).mtimeMs);
    }
  }
  return newest;
}

/**
 * Returns a message when the standalone build is older than the newest web or package source,
 * else undefined. `screens` fails with this message instead of rebuilding (a build can clobber
 * another agent's `.next`).
 */
export function staleBuildMessage(root: string, serverJs: string): string | undefined {
  if (!existsSync(serverJs)) return undefined;
  const built = statSync(serverJs).mtimeMs;
  const sources = [path.join(root, "apps/web")];
  const pkgs = path.join(root, "packages");
  if (existsSync(pkgs)) {
    for (const p of readdirSync(pkgs)) sources.push(path.join(pkgs, p, "src"));
  }
  const newest = Math.max(...sources.map(newestMtime));
  if (newest <= built) return undefined;
  return 'The production build is older than the latest source. Run "pnpm build" and try again.';
}
