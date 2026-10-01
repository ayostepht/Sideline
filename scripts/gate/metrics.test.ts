import { describe, expect, it } from "vitest";
import { summarizeCoverage } from "./coverage.js";
import { median, summarizeLhrs } from "./lighthouse.js";
import { summarizePlaywright } from "./playwright-json.js";
import { parsePreviousReport } from "./report.js";
import { compareWarnings, countEslintMessages } from "./warnings.js";

describe("eslint warning comparison (U1)", () => {
  it("sums warnings and errors from eslint json", () => {
    expect(
      countEslintMessages([
        { filePath: "a", warningCount: 2, errorCount: 0 },
        { filePath: "b", warningCount: 1, errorCount: 3 },
      ]),
    ).toEqual({ warnings: 3, errors: 3 });
    expect(countEslintMessages({ nope: true })).toBeUndefined();
  });

  it("fails when warnings increased and passes when equal, lower, or without a baseline", () => {
    expect(compareWarnings(3, 4).ok).toBe(false);
    expect(compareWarnings(3, 4).reason).toBe("eslint warnings increased from 3 to 4");
    expect(compareWarnings(3, 3).ok).toBe(true);
    expect(compareWarnings(3, 0).ok).toBe(true);
    expect(compareWarnings(undefined, 50).ok).toBe(true);
  });

  it("reads the baseline from the previous report, preferring the carried baseline", () => {
    expect(
      parsePreviousReport(JSON.stringify({ baselines: { eslintWarnings: 2 }, checks: [] })),
    ).toEqual({
      eslintWarnings: 2,
    });
    expect(
      parsePreviousReport(
        JSON.stringify({ checks: [{ id: "U1", metrics: { eslintWarnings: 5 } }] }),
      ),
    ).toEqual({ eslintWarnings: 5 });
    expect(parsePreviousReport("not json")).toEqual({});
    expect(parsePreviousReport("{}")).toEqual({});
  });
});

describe("coverage summary", () => {
  const entry = (lc: number, lt: number, bc: number, bt: number): unknown => ({
    lines: { total: lt, covered: lc },
    branches: { total: bt, covered: bc },
  });

  it("aggregates per workspace package and reports null for no branches", () => {
    const out = summarizeCoverage(
      {
        total: entry(0, 0, 0, 0),
        "/r/packages/core/src/a.ts": entry(9, 10, 3, 4),
        "/r/packages/core/src/b.ts": entry(1, 10, 1, 4),
        "/r/apps/web/lib/server/x.ts": entry(5, 5, 0, 0),
        "/elsewhere/z.ts": entry(1, 1, 0, 0),
      },
      "/r",
    );
    expect(out).toEqual({
      "apps/web": { linesPct: 100, branchesPct: null },
      other: { linesPct: 100, branchesPct: null },
      "packages/core": { linesPct: 50, branchesPct: 50 },
    });
  });
});

describe("playwright json summary", () => {
  it("tallies tagged tests per outcome and lists projects", () => {
    const json = {
      suites: [
        {
          title: "smoke.spec.ts",
          suites: [
            {
              title: "route /",
              specs: [
                {
                  title: "UI5: / has no horizontal scroll",
                  tests: [
                    { projectName: "a", status: "expected" },
                    { projectName: "b", status: "unexpected" },
                  ],
                },
                { title: "UI2: / axe (light)", tests: [{ projectName: "a", status: "expected" }] },
              ],
            },
          ],
        },
      ],
      stats: { expected: 2, unexpected: 1, flaky: 0, skipped: 0 },
    };
    expect(summarizePlaywright(json, ["UI2", "UI5"])).toEqual({
      expected: 2,
      unexpected: 1,
      flaky: 0,
      skipped: 0,
      projects: ["a", "b"],
      tags: {
        UI2: { passed: 1, failed: 0, skipped: 0 },
        UI5: { passed: 1, failed: 1, skipped: 0 },
      },
    });
    expect(summarizePlaywright({ junk: 1 }, [])).toBeUndefined();
  });
});

describe("lighthouse summary", () => {
  it("takes the median per category and url, scaled to 0-100", () => {
    const lhr = (perf: number): unknown => ({
      finalUrl: "http://x/",
      categories: { performance: { score: perf }, accessibility: { score: 1 } },
    });
    expect(summarizeLhrs([lhr(0.9), lhr(0.8), lhr(1)])).toEqual({
      "http://x/": { performance: 90, accessibility: 100 },
    });
    expect(median([])).toBeUndefined();
    expect(median([1, 3])).toBe(2);
  });
});
