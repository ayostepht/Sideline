import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findLeaks } from "./leak-check.js";
import { isScanExcluded, listRepoPaths, readRepoFiles } from "./repo-files.js";
import { collectIdentifiers } from "./sanitize.js";
import { REAL, syntheticRaw } from "./test-data.js";

describe("whole-repo scan", () => {
  let dir = "";
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "repo-scan-"));
    execFileSync("git", ["init", "-q"], { cwd: dir });
    put(".gitignore", ".spike-cache/\n.env\n");
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function put(rel: string, text: string): void {
    const full = join(dir, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }

  it("excludes secrets and raw caches but lists everything else, tracked or not", () => {
    put("scripts/a.ts", "export {};\n");
    put("docs/notes.md", "hello\n");
    put(".env", `X=${REAL.userA}\n`);
    put(".spike-cache/raw.json", `{"id":"${REAL.userA}"}`);
    put(".env.example", "X=\n");
    execFileSync("git", ["add", "scripts/a.ts"], { cwd: dir });
    expect(listRepoPaths(dir)).toEqual([
      ".env.example",
      ".gitignore",
      "docs/notes.md",
      "scripts/a.ts",
    ]);
    expect(isScanExcluded(".env")).toBe(true);
    expect(isScanExcluded("apps/web/.env.local")).toBe(true);
    expect(isScanExcluded(".env.example")).toBe(false);
  });

  it("detects a planted real-shaped id and name in a non-fixture file", () => {
    put("scripts/helper.ts", `const owner = "${REAL.userB}"; // ${REAL.teamA}\n`);
    put("docs/clean.md", "nothing here\n");
    const ids = collectIdentifiers(syntheticRaw(), REAL.leagueId, { names: [REAL.username] });
    const leaks = findLeaks(readRepoFiles(dir), ids);
    expect(
      leaks
        .filter((l) => l.file === "scripts/helper.ts")
        .map((l) => l.category)
        .sort(),
    ).toEqual(["id", "name"]);
    expect(leaks.some((l) => l.file === "docs/clean.md")).toBe(false);
  });
});
