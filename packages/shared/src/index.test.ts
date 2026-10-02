import { describe, expect, it } from "vitest";
import { PACKAGE_NAME, SYNC_CADENCE_MS, SYNC_JOB_NAMES } from "./index.js";

describe("@sideline/shared", () => {
  it("exports its package name", () => {
    expect(PACKAGE_NAME).toBe("@sideline/shared");
  });
});

describe("SYNC_CADENCE_MS", () => {
  it("has a key for every sync job", () => {
    expect(Object.keys(SYNC_CADENCE_MS).sort()).toEqual([...SYNC_JOB_NAMES].sort());
    expect(SYNC_CADENCE_MS.backfill_2025).toBeNull();
  });
});
