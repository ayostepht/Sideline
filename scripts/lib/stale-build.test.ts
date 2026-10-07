import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { staleBuildMessage } from "./stale-build.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function setup(buildSec: number, sourceSec: number) {
  const root = mkdtempSync(path.join(tmpdir(), "stale-"));
  dirs.push(root);
  mkdirSync(path.join(root, "apps/web/app"), { recursive: true });
  const src = path.join(root, "apps/web/app/page.tsx");
  writeFileSync(src, "x");
  utimesSync(src, sourceSec, sourceSec);
  const serverJs = path.join(root, "apps/web/.next/standalone/apps/web/server.js");
  mkdirSync(path.dirname(serverJs), { recursive: true });
  writeFileSync(serverJs, "x");
  utimesSync(serverJs, buildSec, buildSec);
  return { root, serverJs };
}

describe("staleBuildMessage", () => {
  it("flags a build older than the source", () => {
    const { root, serverJs } = setup(1000, 2000);
    expect(staleBuildMessage(root, serverJs)).toContain("pnpm build");
  });
  it("passes when the build is newer", () => {
    const { root, serverJs } = setup(2000, 1000);
    expect(staleBuildMessage(root, serverJs)).toBeUndefined();
  });
  it("ignores files under .next", () => {
    const { root, serverJs } = setup(1000, 500);
    writeFileSync(path.join(root, "apps/web/.next/newer.js"), "x");
    expect(staleBuildMessage(root, serverJs)).toBeUndefined();
  });
});
