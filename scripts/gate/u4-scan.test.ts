import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scanRepo, scanText } from "./u4-scan.js";

// Violations are assembled from parts so this test file does not trip the real scan.
const ANY = `an${"y"}`;
const ONLY = `.on${"ly"}(`;
const SKIP = `.sk${"ip"}(`;
const MARKER = `TO${"DO"}`;
const DISABLE = `eslint-${"disable"}`;

const rules = (path: string, text: string): string[] => scanText(path, text).map((f) => f.rule);

describe("U4 scanner", () => {
  it("flags focused and skipped tests in test files only", () => {
    expect(rules("a/foo.test.ts", `it${ONLY}"x", () => {});`)).toEqual(["skip-only"]);
    expect(rules("e2e/foo.spec.ts", `test.describe${SKIP}"x", () => {});`)).toEqual(["skip-only"]);
    expect(rules("a/foo.ts", `it${ONLY}"x", () => {});`)).toEqual([]);
  });

  it("flags explicit any in its common spellings", () => {
    expect(rules("a.ts", `const x: ${ANY} = 1;`)).toEqual(["any"]);
    expect(rules("a.ts", `const x = y as ${ANY};`)).toEqual(["any"]);
    expect(rules("a.ts", `const x = <${ANY}>y;`)).toEqual(["any"]);
    expect(rules("a.ts", `const x: Record<string, ${ANY}> = {};`)).toEqual(["any"]);
    expect(rules("a.ts", `function f(a: ${ANY}[]) {}`)).toEqual(["any"]);
  });

  it("does not flag words that merely contain any", () => {
    expect(rules("a.ts", "const company = many.anything;")).toEqual([]);
    expect(rules("a.ts", "// returns any value the caller wants")).toEqual([]);
  });

  it("flags a lint disable without a justification and allows one with `-- reason`", () => {
    expect(rules("a.ts", `// ${DISABLE}-next-line no-console`)).toEqual(["eslint-disable"]);
    expect(rules("a.ts", `/* ${DISABLE} */`)).toEqual(["eslint-disable"]);
    expect(rules("a.ts", `// ${DISABLE}-next-line no-console -- CLI output is the point`)).toEqual(
      [],
    );
  });

  it("flags a TODO without a task id and allows ones with an id", () => {
    expect(rules("a.ts", `// ${MARKER}: fix later`)).toEqual(["todo"]);
    expect(rules("a.ts", `// ${MARKER}`)).toEqual(["todo"]);
    expect(rules("a.ts", `// ${MARKER}(T1.2): fix later`)).toEqual([]);
    expect(rules("a.ts", `// ${MARKER}(T0.3b) fix later`)).toEqual([]);
    expect(rules("a.ts", `// ${MARKER} T4.3 wire it up`)).toEqual([]);
  });

  it("reports file, line and the offending text", () => {
    const [finding] = scanText("src/a.ts", `ok();\nconst x: ${ANY} = 1;\n`);
    expect(finding).toMatchObject({ file: "src/a.ts", line: 2, rule: "any" });
  });

  it("scans TS and JS sources but skips fixtures, node_modules and JSON", () => {
    const root = mkdtempSync(path.join(tmpdir(), "u4-"));
    const bad = `const x: ${ANY} = 1;\n`;
    for (const rel of [
      "src/a.ts",
      "src/b.tsx",
      "src/c.mjs",
      "tests/fixtures/sleeper/skip.ts",
      "node_modules/pkg/index.js",
      ".next/x.js",
      "tests/fixtures/data.json",
    ]) {
      mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      writeFileSync(path.join(root, rel), bad);
    }
    const result = scanRepo(root);
    expect(result.findings.map((f) => f.file).sort()).toEqual([
      "src/a.ts",
      "src/b.tsx",
      "src/c.mjs",
    ]);
    expect(result.filesScanned).toBe(3);
  });
});
