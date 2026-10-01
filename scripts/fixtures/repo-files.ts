/**
 * Lists the files the whole-repo leak scan must read (ADR-000 whole-repo rule):
 * every tracked or untracked-but-not-ignored file, minus secrets and raw caches.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { FixtureFile } from "./leak-check.js";

const MAX_BYTES = 30 * 1024 * 1024;

/** Paths never scanned: they legitimately hold the real values. */
export function isScanExcluded(path: string): boolean {
  const parts = path.split("/");
  const base = parts[parts.length - 1] ?? "";
  return (
    base === ".env" ||
    (base.startsWith(".env.") && base !== ".env.example") ||
    parts.includes(".spike-cache")
  );
}

/** Relative paths from `git ls-files -co --exclude-standard`, minus excluded paths. */
export function listRepoPaths(repoRoot: string): string[] {
  const out = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], {
    cwd: repoRoot,
    maxBuffer: 256 * 1024 * 1024,
  }).toString("utf8");
  return [...new Set(out.split("\0").filter((p) => p.length > 0))]
    .filter((p) => !isScanExcluded(p))
    .sort();
}

/** Reads every repo file as text. Missing or oversized files are skipped. */
export function readRepoFiles(repoRoot: string): FixtureFile[] {
  const files: FixtureFile[] = [];
  for (const path of listRepoPaths(repoRoot)) {
    const full = join(repoRoot, path);
    try {
      if (statSync(full).size > MAX_BYTES) continue;
      files.push({ path, text: readFileSync(full, "utf8") });
    } catch {
      // Deleted since listing, or unreadable: nothing to scan.
    }
  }
  return files;
}
