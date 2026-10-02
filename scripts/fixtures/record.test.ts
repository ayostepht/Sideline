import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseArgs } from "./record.js";

const REPO = join("/", "work", "repo");

describe("record.ts parseArgs", () => {
  it("returns defaults", () => {
    const a = parseArgs([], REPO);
    expect(a).toMatchObject({ check: false, refresh: false, rootGiven: false, maxAgeHours: 2 });
    expect(a.root).toBe(join(REPO, "tests", "fixtures", "sleeper"));
  });

  it("accepts a root under tests/fixtures and a large max age", () => {
    const a = parseArgs(["--root", "tests/fixtures/tmp-out", "--max-age-hours", "100000"], REPO);
    expect(a.root).toBe(join(REPO, "tests", "fixtures", "tmp-out"));
    expect(a.rootGiven).toBe(true);
    expect(a.maxAgeHours).toBe(100000);
  });

  it("refuses a root outside tests/fixtures", () => {
    for (const bad of [
      "/",
      REPO,
      join(REPO, "src"),
      join(REPO, "tests"),
      join(REPO, "tests", "fixtures"),
      join(REPO, "tests", "fixtures", "..", "e2e"),
      join(REPO, "tests", "fixtures-evil"),
      "../elsewhere",
    ]) {
      expect(() => parseArgs(["--root", bad], REPO), bad).toThrow(/under tests\/fixtures/);
    }
  });

  it("errors when a flag that needs a value has none", () => {
    expect(() => parseArgs(["--root"], REPO)).toThrow(/needs a value/);
    expect(() => parseArgs(["--max-age-hours"], REPO)).toThrow(/needs a value/);
    expect(() => parseArgs(["--root", "--check"], REPO)).toThrow(/needs a value/);
  });

  it("requires --max-age-hours to be a positive number", () => {
    for (const bad of ["0", "-1", "abc", "NaN", "Infinity"]) {
      expect(() => parseArgs(["--max-age-hours", bad], REPO), bad).toThrow(/positive number/);
    }
  });

  it("errors on unknown flags", () => {
    expect(() => parseArgs(["--wat"], REPO)).toThrow(/unknown argument/);
    expect(() => parseArgs(["extra"], REPO)).toThrow(/unknown argument/);
  });
});
